import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { KookSyncService } from '../kook/kook-sync.service';
import { KookNotifyService } from '../kook/kook-notify.service';
import { KookService } from '../kook/kook.service';
import { AlertService } from '../alert/alert.service';
import { ResupplyService } from '../resupply/resupply.service';
import { ScheduledTask } from './entities/scheduled-task.entity';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(ScheduledTask) private taskRepo: Repository<ScheduledTask>,
    private kookSyncService: KookSyncService,
    private kookNotifyService: KookNotifyService,
    private kookService: KookService,
    private alertService: AlertService,
    private resupplyService: ResupplyService,
  ) {}

  /** 每天 0:15 — KOOK 成员同步 */
  @Cron('0 15 0 * * *')
  async syncAllGuildMembers() {
    this.logger.log('定时任务：开始同步所有公会 KOOK 成员');
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const startTime = Date.now();

    for (const guild of guilds) {
      if (!guild.kookBotToken || !guild.kookGuildId) continue;
      this.logger.log(`同步公会: ${guild.name}`);
      await this.kookSyncService.syncGuildInfo(guild);
      await this.kookSyncService.syncGuildMembers(guild);
    }

    await this.recordTask('kook_member_sync', Date.now() - startTime, `已同步 ${guilds.length} 个公会`);
  }

  /** 每天 05:00 — 补装库存预警 */
  @Cron('0 0 5 * * *')
  async refreshInventoryAlerts() {
    this.logger.log('定时任务：开始刷新所有公会库存预警（05:00）');
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const startTime = Date.now();
    let totalAlerts = 0;

    for (const guild of guilds) {
      try {
        const alerts = await this.alertService.scanInventoryAlerts(guild.id);
        if (alerts.length > 0 && guild.kookAdminChannelId) {
          const summary = alerts.map((a) => ({
            ruleName: a.message,
            currentValue: a.currentValue,
            threshold: a.thresholdValue,
            message: a.message,
          }));
          await this.kookNotifyService.pushAlertSummary(summary, guild.kookAdminChannelId, guild.kookAdminRoleId);
          totalAlerts += alerts.length;
        }
        // 推送后标记 isCounted
        await this.alertService.markInventoryAsCounted(guild.id);
      } catch (err) {
        this.logger.error(`[${guild.name}] 库存预警失败: ${err}`);
      }
    }

    await this.recordTask('inventory_alert', Date.now() - startTime, `已推送 ${totalAlerts} 条库存预警`);
  }

  /** 每天 06:00 — 死亡次数预警（统计补装申请记录） */
  @Cron('0 0 6 * * *')
  async refreshDeathCountAlerts() {
    this.logger.log('定时任务：开始统计死亡次数预警（06:00）');
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const startTime = Date.now();
    let totalAlerts = 0;

    for (const guild of guilds) {
      try {
        const alerts = await this.alertService.scanDeathCountAlerts(guild.id);
        if (alerts.length > 0 && guild.kookAdminChannelId) {
          const summary = alerts.map((a) => ({
            ruleName: '死亡次数预警',
            currentValue: a.currentValue,
            threshold: a.thresholdValue,
            message: a.message,
          }));
          await this.kookNotifyService.pushAlertSummary(summary, guild.kookAdminChannelId, guild.kookAdminRoleId);
          totalAlerts += alerts.length;
        }
        // 推送后标记已统计
        await this.alertService.markResupplyAsCounted(guild.id);
      } catch (err) {
        this.logger.error(`[${guild.name}] 死亡次数预警失败: ${err}`);
      }
    }

    await this.recordTask('death_count_alert', Date.now() - startTime, `已推送 ${totalAlerts} 条死亡预警`);
  }

  /** 每天 14:00 — 补装通过回应表情 */
  @Cron('0 0 14 * * *')
  async addResupplyApprovalReaction() {
    this.logger.log('定时任务：开始给已通过补装添加回应表情（14:00）');
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const startTime = Date.now();
    let totalReacted = 0;

    for (const guild of guilds) {
      if (!guild.kookBotToken) continue;

      try {
        const approvedItems = await this.resupplyService.getApprovedUnreacted(guild.id);
        if (approvedItems.length === 0) continue;

        const reactedIds: number[] = [];
        for (const item of approvedItems) {
          if (!item.kookMessageId) continue;

          // 提取原始 KOOK 消息ID（去掉 _0, _1 后缀）
          const originalMsgId = item.kookMessageId.split('_')[0];
          try {
            // 添加 ✅ 表情回应
            await this.kookService.addReaction(originalMsgId, '✅', guild.kookBotToken);
            reactedIds.push(item.id);
            totalReacted++;
            // 避免频率限制
            await new Promise(r => setTimeout(r, 300));
          } catch (err) {
            this.logger.error(`给消息 ${originalMsgId} 添加表情失败: ${err}`);
          }
        }

        // 标记为已回应
        if (reactedIds.length > 0) {
          await this.resupplyService.markAsCounted(reactedIds);
          this.logger.log(`[${guild.name}] 已给 ${reactedIds.length} 条补装添加回应表情`);
        }
      } catch (err) {
        this.logger.error(`[${guild.name}] 补装回应表情失败: ${err}`);
      }
    }

    await this.recordTask('resupply_reaction', Date.now() - startTime, `已回应 ${totalReacted} 条`);
  }

  private async recordTask(name: string, durationMs: number, result: string) {
    let task = await this.taskRepo.findOne({ where: { taskName: name } });
    if (!task) task = this.taskRepo.create({ taskName: name, cronExpression: '', status: 1 });
    task.lastRunAt = new Date();
    task.lastRunResult = result;
    task.durationMs = durationMs;
    await this.taskRepo.save(task);
  }
}

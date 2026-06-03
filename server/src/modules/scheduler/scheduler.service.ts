import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { KookSyncService } from '../kook/kook-sync.service';
import { KookNotifyService } from '../kook/kook-notify.service';
import { KookService } from '../kook/kook.service';
import { KookMessageService } from '../kook/kook-message.service';
import { AlertService } from '../alert/alert.service';
import { ResupplyService } from '../resupply/resupply.service';
import { MemberService } from '../member/member.service';
import { AlbionKillboardService } from '../albion/albion-killboard.service';
import { ScheduledTask } from './entities/scheduled-task.entity';

import { InventoryLog } from '../inventory-log/entities/inventory-log.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { GuildStatus } from '../../common/constants/enums';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(ScheduledTask)
    private taskRepo: Repository<ScheduledTask>,
    @InjectRepository(InventoryLog)
    private inventoryLogRepo: Repository<InventoryLog>,
    @InjectRepository(EquipmentCatalog)
    private catalogRepo: Repository<EquipmentCatalog>,
    private kookSyncService: KookSyncService,
    private kookNotifyService: KookNotifyService,
    private kookService: KookService,
    private kookMessageService: KookMessageService,
    private alertService: AlertService,
    private resupplyService: ResupplyService,
    private memberService: MemberService,
    private albionKillboardService: AlbionKillboardService,
  ) {}

  /** 每天 07:00（北京时间）— Albion 官网公会成员同步 */
  @Cron('0 0 7 * * *', { timeZone: 'Asia/Shanghai' })
  async syncAllAlbionGuildMembers() {
    this.logger.log('定时任务：开始同步所有公会 Albion 成员');
    const startTime = Date.now();
    const result = await this.memberService.syncAllAlbionGuildMembers();
    await this.recordTask(
      'albion_member_sync',
      Date.now() - startTime,
      `已同步 ${result.synced} 个公会`,
    );
  }

  /** 每天 0:15（北京时间）— KOOK 成员同步 */

  @Cron('0 15 0 * * *', { timeZone: 'Asia/Shanghai' })
  async syncAllGuildMembers() {
    this.logger.log('定时任务：开始同步所有公会 KOOK 成员');
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const startTime = Date.now();

    for (const guild of guilds) {
      if (!guild.kookGuildId || guild.kookGuildId.startsWith('test-')) continue;
      this.logger.log(`同步公会: ${guild.name}`);
      await this.kookSyncService.syncGuildInfo(guild);
      await this.kookSyncService.syncGuildMembers(guild);
    }

    await this.recordTask(
      'kook_member_sync',
      Date.now() - startTime,
      `已同步 ${guilds.length} 个公会`,
    );
  }

  /** 每天 05:00（北京时间）— 补装库存预警 */
  @Cron('0 0 5 * * *', { timeZone: 'Asia/Shanghai' })
  async refreshInventoryAlerts() {
    this.logger.log('定时任务：开始刷新所有公会库存预警（05:00）');
    const guilds = await this.guildRepo.find({
      where: { status: GuildStatus.ACTIVE },
    });
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
          await this.kookNotifyService.pushAlertSummary(
            summary,
            guild.kookAdminChannelId,
            guild.kookAdminRoleId,
          );
          totalAlerts += alerts.length;
        }
        // 推送后标记 isCounted
        await this.alertService.markInventoryAsCounted(guild.id);
      } catch (err) {
        this.logger.error(`[${guild.name}] 库存预警失败: ${err}`);
      }
    }

    await this.recordTask(
      'inventory_alert',
      Date.now() - startTime,
      `已推送 ${totalAlerts} 条库存预警`,
    );
  }

  /** 每天 06:00（北京时间）— 死亡次数预警（统计补装申请记录） */
  @Cron('0 0 6 * * *', { timeZone: 'Asia/Shanghai' })
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
          await this.kookNotifyService.pushAlertSummary(
            summary,
            guild.kookAdminChannelId,
            guild.kookAdminRoleId,
          );
          totalAlerts += alerts.length;
        }
        // 推送后标记已统计
        await this.alertService.markResupplyAsCounted(guild.id);
      } catch (err) {
        this.logger.error(`[${guild.name}] 死亡次数预警失败: ${err}`);
      }
    }

    await this.recordTask(
      'death_count_alert',
      Date.now() - startTime,
      `已推送 ${totalAlerts} 条死亡预警`,
    );
  }

  /** 每天 14:00 — 补装通过回应表情（V2.9.7: 暂停，待重新设计通知规则） */
  // @Cron('0 0 14 * * *')
  async addResupplyApprovalReaction() {
    this.logger.log('定时任务：补装回应表情已暂停');
    return;
    /* 原逻辑暂停
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
    原逻辑暂停结束 */
  }

  /**
   * V2.9.7 F-157: 每天 03:00 — 装备热度统计
   * 统计每个catalogId在inventory_logs中action=resupply_deduct的总扣减次数（所有公会合计）
   * 规则：>=1次→1, >100次→2, >1000次→3, >10000次→4，未出现→0
   */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Shanghai' })
  async refreshEquipmentPopularity() {
    this.logger.log('定时任务：开始刷新装备热度（北京 03:00）');
    const startTime = Date.now();

    try {
      // 统计每个catalogId的总扣减次数（所有公会合计）
      const deductCounts: { catalogId: number; cnt: string }[] =
        await this.inventoryLogRepo
          .createQueryBuilder('l')
          .select('l.catalog_id', 'catalogId')
          .addSelect('COUNT(*)', 'cnt')
          .where('l.action = :action', { action: 'resupply_deduct' })
          .groupBy('l.catalog_id')
          .getRawMany();

      let updated = 0;
      const updatedIds: number[] = [];
      for (const row of deductCounts) {
        if (!row.catalogId) continue;
        const count = parseInt(row.cnt, 10) || 0;
        let popularity = 0;
        if (count > 10000) popularity = 4;
        else if (count > 1000) popularity = 3;
        else if (count > 100) popularity = 2;
        else if (count >= 1) popularity = 1;

        await this.catalogRepo.update(row.catalogId, { popularity });
        updatedIds.push(row.catalogId);
        if (popularity > 0) updated++;
      }

      // 未出现在扣减记录中的装备重置为0
      await this.catalogRepo
        .createQueryBuilder()
        .update(EquipmentCatalog)
        .set({ popularity: 0 })
        .where('popularity > 0')
        .andWhere('id NOT IN (:...ids)', {
          ids: updatedIds.concat([0]),
        })
        .execute();

      this.logger.log(`装备热度刷新完成: ${updated} 件装备热度已更新`);
      await this.recordTask(
        'equipment_popularity',
        Date.now() - startTime,
        `已更新 ${updated} 件装备热度`,
      );
    } catch (err) {
      this.logger.error(`装备热度刷新失败: ${err}`);
      await this.recordTask(
        'equipment_popularity',
        Date.now() - startTime,
        `失败: ${err}`,
      );
    }
  }

  /** V3.0: 每天 02:00（北京时间）— 拉取 Albion Killboard 战报（所有公会死亡记录） */
  @Cron('0 0 2 * * *', { timeZone: 'Asia/Shanghai' })
  async pullAllGuildBattleReports() {
    this.logger.log('定时任务：开始拉取所有公会 Albion 战报（北京 02:00）');
    const guilds = await this.guildRepo.find({ where: { status: GuildStatus.ACTIVE } });
    const startTime = Date.now();
    let totalNew = 0;

    for (const guild of guilds) {
      try {
        const result = await this.albionKillboardService.pullGuildDeaths(guild.id);
        totalNew += result.newRecords;
      } catch (err) {
        this.logger.error(`[${guild.name}] 战报拉取失败: ${err}`);
      }
    }

    await this.recordTask(
      'battle_report_pull',
      Date.now() - startTime,
      `已拉取 ${totalNew} 条新战报`,
    );
  }

  /** V3.0.2: 每天4次（北京时间）— 轮询 KOOK 补装频道消息（08:00/12:00/18:00/23:00） */
  @Cron('0 0 8,12,18,23 * * *', { timeZone: 'Asia/Shanghai' })
  async pollKookResupplyChannels() {
    this.logger.log('定时任务：轮询 KOOK 补装频道消息');
    const guilds = await this.guildRepo.find({ where: { status: GuildStatus.ACTIVE } });
    const startTime = Date.now();
    let totalProcessed = 0;

    for (const guild of guilds) {
      if (!guild.kookBotToken || !guild.kookListenChannelIds || guild.kookListenChannelIds.length === 0) continue;

      try {
        const result = await this.kookMessageService.pullHistoryMessages(guild.id);
        totalProcessed += result.processed || 0;
      } catch (err) {
        this.logger.error(`[${guild.name}] 频道轮询失败: ${err}`);
      }
    }

    await this.recordTask(
      'kook_channel_poll',
      Date.now() - startTime,
      `已处理 ${totalProcessed} 条消息`,
    );
  }

  private async recordTask(name: string, durationMs: number, result: string) {
    let task = await this.taskRepo.findOne({ where: { taskName: name } });
    if (!task)
      task = this.taskRepo.create({
        taskName: name,
        cronExpression: '',
        status: 1,
      });
    task.lastRunAt = new Date();
    task.lastRunResult = result;
    task.durationMs = durationMs;
    await this.taskRepo.save(task);
  }
}

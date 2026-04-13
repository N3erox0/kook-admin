import { Injectable, Logger } from '@nestjs/common';
import { KookService } from './kook.service';
import { ResupplyStatus } from '../../common/constants/enums';

@Injectable()
export class KookNotifyService {
  private readonly logger = new Logger(KookNotifyService.name);

  constructor(private kookService: KookService) {}

  /** 补装状态变更 → 频道通知 */
  async notifyResupplyStatusChange(
    memberName: string,
    equipmentName: string,
    quantity: number,
    status: ResupplyStatus,
    processRemark?: string,
  ): Promise<void> {
    const statusText = this.getStatusText(status);
    let message = `**补装申请状态变更**\n` +
      `申请人：${memberName}\n` +
      `装备：${equipmentName} x${quantity}\n` +
      `状态：${statusText}`;

    if (processRemark) {
      message += `\n备注：${processRemark}`;
    }

    await this.kookService.sendKMarkdownMessage(message);
    this.logger.log(`补装通知已推送: ${memberName} - ${equipmentName} - ${statusText}`);
  }

  /** 驳回时私信通知申请人 */
  async notifyResupplyRejected(
    kookUserId: string,
    equipmentName: string,
    quantity: number,
    rejectReason: string,
  ): Promise<void> {
    if (!kookUserId) {
      this.logger.warn('申请人无 KOOK ID，跳过私信通知');
      return;
    }
    const message = `**补装申请已驳回**\n` +
      `装备：${equipmentName} x${quantity}\n` +
      `驳回原因：${rejectReason}\n` +
      `如有疑问请联系管理员。`;

    await this.kookService.sendDirectMessage(kookUserId, message);
    this.logger.log(`驳回私信已发送 -> ${kookUserId}`);
  }

  /** 审批通过后私信通知申请人 */
  async notifyResupplyApproved(
    kookUserId: string,
    equipmentName: string,
    quantity: number,
  ): Promise<void> {
    if (!kookUserId) {
      this.logger.warn('申请人无 KOOK ID，跳过私信通知');
      return;
    }
    const message = `**补装申请已通过**\n` +
      `装备：${equipmentName} x${quantity}\n` +
      `系统已自动从库存中扣减，请耐心等待发放。`;

    await this.kookService.sendDirectMessage(kookUserId, message);
    this.logger.log(`审批通过私信已发送 -> ${kookUserId}`);
  }

  /** 发放成功后私信通知申请人 */
  async notifyResupplyDispatched(
    kookUserId: string,
    equipmentName: string,
    dispatchQuantity: number,
  ): Promise<void> {
    if (!kookUserId) {
      this.logger.warn('申请人无 KOOK ID，跳过私信通知');
      return;
    }
    const message = `**补装申请已通过并发放**\n` +
      `装备：${equipmentName} x${dispatchQuantity}\n` +
      `请及时查收。`;

    await this.kookService.sendDirectMessage(kookUserId, message);
    this.logger.log(`发放私信已发送 -> ${kookUserId}`);
  }

  /** 库存预警触发 → 频道通知 */
  async notifyAlertTriggered(
    ruleName: string,
    currentValue: number,
    threshold: number,
    message: string,
  ): Promise<void> {
    const alertMsg = `**库存预警触发**\n` +
      `规则：${ruleName}\n` +
      `当前值：${currentValue}，阈值：${threshold}\n` +
      `${message}`;

    await this.kookService.sendKMarkdownMessage(alertMsg);
  }

  /** 聚合预警推送到管理员频道，@管理员角色 */
  async pushAlertSummary(
    alerts: { ruleName: string; currentValue: number; threshold: number; message: string }[],
    channelId: string,
    adminRoleId?: string,
  ): Promise<void> {
    if (!alerts.length) return;

    let msg = `**库存预警日报（${new Date().toLocaleDateString('zh-CN')}）**\n`;
    msg += `共 ${alerts.length} 条预警：\n\n`;
    for (const a of alerts) {
      msg += `- ${a.ruleName}：当前 ${a.currentValue}，阈值 ${a.threshold}\n`;
    }

    // 如果配置了管理员角色 ID，则 @角色
    if (adminRoleId) {
      msg = `(rol)${adminRoleId}(rol) ${msg}`;
      await this.kookService.sendKMarkdownMessage(msg, channelId);
    } else {
      await this.kookService.sendChannelMessage(msg, channelId);
    }

    this.logger.log(`预警日报已推送，共 ${alerts.length} 条`);
  }

  /** 向特定角色推送自定义消息（频道 @角色） */
  async notifyRole(
    roleId: string | number,
    content: string,
    channelId?: string,
  ): Promise<void> {
    await this.kookService.sendMessageToRole(roleId, content, channelId);
    this.logger.log(`角色 ${roleId} 通知已推送`);
  }

  private getStatusText(status: ResupplyStatus): string {
    switch (status) {
      case ResupplyStatus.PENDING: return '待审批';
      case ResupplyStatus.APPROVED: return '已通过';
      case ResupplyStatus.REJECTED: return '已驳回';
      case ResupplyStatus.DISPATCHED: return '已发放';
      default: return '未知状态';
    }
  }
}

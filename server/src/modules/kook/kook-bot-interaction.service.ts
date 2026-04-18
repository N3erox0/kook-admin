import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookService } from './kook.service';
import { BotJoinRecord } from './entities/bot-join-record.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { InviteCodeStatus } from '../../common/constants/enums';
import { ConfigService } from '@nestjs/config';

/** Bot 与用户的私信交互服务 */
@Injectable()
export class KookBotInteractionService {
  private readonly logger = new Logger(KookBotInteractionService.name);
  // 防刷：记录最近回复过宣导的用户（userId → timestamp）
  private readonly recentReplies = new Map<string, number>();
  private readonly COOLDOWN_MS = 60 * 60 * 1000; // 1小时

  constructor(
    @InjectRepository(BotJoinRecord) private joinRecordRepo: Repository<BotJoinRecord>,
    @InjectRepository(InviteCode) private inviteRepo: Repository<InviteCode>,
    private kookService: KookService,
    private configService: ConfigService,
  ) {}

  /** 处理私信消息（channel_type=PERSON） */
  async handlePrivateMessage(authorId: string, content: string): Promise<void> {
    const text = (content || '').trim();
    this.logger.log(`[私信] 收到用户 ${authorId} 的消息: "${text.slice(0, 100)}"`);

    // 最优先：检查该用户是否有未完成的 Bot 加入事件（dm_failed / pending）
    // 用户主动私聊 Bot 后，KOOK 允许 Bot 回信 → 此时补发邀请码
    const autoSent = await this.tryAutoDeliverInviteCode(authorId);
    if (autoSent) {
      this.logger.log(`[私信] 已为 ${authorId} 自动补发邀请码`);
      return;
    }

    // 关键词路由
    if (this.matchKeyword(text, ['邀请码', '注册码', '激活码'])) {
      await this.replyInviteCodeGuide(authorId);
      return;
    }
    if (this.matchKeyword(text, ['/帮助', '/help', '帮助', 'help'])) {
      await this.replyHelp(authorId);
      return;
    }
    if (this.matchKeyword(text, ['/试用', '试用', '体验'])) {
      await this.replyTrial(authorId);
      return;
    }

    // 非关键词 → 检查是否首次私信，首次发送宣导
    await this.replyWelcomeIfFirst(authorId);
  }

  /**
   * 尝试给用户自动补发邀请码。
   * 场景：Bot 被邀请进某服务器时，因"用户未主动私聊过 Bot"导致首次私信失败(dm_failed)。
   * 现在用户私聊 Bot，KOOK 允许 Bot 回信，此时我们主动补发。
   */
  private async tryAutoDeliverInviteCode(userId: string): Promise<boolean> {
    // 查找该用户作为邀请者的未完成记录（dm_failed 或 pending 且有邀请码）
    const records = await this.joinRecordRepo.find({
      where: [
        { inviterKookId: userId, status: 'dm_failed' },
        { inviterKookId: userId, status: 'pending' },
      ],
      order: { joinedAt: 'DESC' },
    });
    if (!records || records.length === 0) return false;

    const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://22bngm.online';
    let delivered = false;

    for (const rec of records) {
      if (!rec.inviteCodeId) continue;
      const invite = await this.inviteRepo.findOne({ where: { id: rec.inviteCodeId } });
      if (!invite || invite.status !== InviteCodeStatus.ENABLED) continue;

      const msg =
        `**🎉 您之前邀请我加入了 ${rec.guildName || rec.kookGuildId}！**\n\n` +
        `现在可以使用您的专属邀请码开通管理后台：\n\n` +
        `**邀请码**：\`${invite.code}\`\n` +
        `**立即开通**：[👉 点击配置](${baseUrl}/join?code=${invite.code})\n\n` +
        `该邀请码在公会绑定成功前始终有效。\n` +
        `如有疑问，发送 \`/帮助\` 查看指令列表。`;

      const ok = await this.kookService.sendDirectMessage(userId, msg, 9);
      if (ok) {
        rec.status = 'pending';
        await this.joinRecordRepo.save(rec);
        delivered = true;
        this.logger.log(`[私信-补发] ${userId} 获取邀请码 ${invite.code} (服务器 ${rec.kookGuildId})`);
      } else {
        this.logger.warn(`[私信-补发] ${userId} 补发邀请码失败 (code=${invite.code})`);
      }
    }

    return delivered;
  }

  /** 首次私信 → 发送宣导链接 */
  private async replyWelcomeIfFirst(userId: string): Promise<void> {
    // 防刷检查
    const lastReply = this.recentReplies.get(userId);
    if (lastReply && Date.now() - lastReply < this.COOLDOWN_MS) return;

    const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://22bngm.online';
    const msg =
      `**👋 你好！我是 KOOK 公会管理助手**\n\n` +
      `我可以帮助你的公会管理装备库存、补装申请和成员数据。\n\n` +
      `**🌐 访问官网了解更多：**\n` +
      `[${baseUrl}](${baseUrl})\n\n` +
      `**🚀 快速开始：**\n` +
      `1. 将我邀请到你的 KOOK 服务器\n` +
      `2. 邀请成功后，**请回到这里回复任意消息**（如"成功"）\n` +
      `3. 我会自动发送你的专属邀请码\n` +
      `4. 使用邀请码前往官网注册管理后台\n\n` +
      `> ⚠️ 由于 KOOK 平台限制，邀请 Bot 后需要您**先在此对话中回复一条消息**，我才能向您发送邀请码。\n\n` +
      `如需帮助，发送 **\`/帮助\`** 查看全部指令。`;

    try {
      await this.kookService.sendDirectMessage(userId, msg, 9); // type=9 KMarkdown
      this.recentReplies.set(userId, Date.now());
      this.logger.log(`宣导消息已发送给 ${userId}`);
    } catch (err) {
      this.logger.error(`发送宣导消息失败: ${err}`);
    }
  }

  /** 关键词"邀请码" → 提示邀请 Bot */
  private async replyInviteCodeGuide(userId: string): Promise<void> {
    const msg =
      `**📋 关于邀请码**\n\n` +
      `邀请码用于开通公会管理后台，获取方式：\n\n` +
      `1️⃣ **先将我邀请到你的 KOOK 服务器**\n` +
      `   [👉 点击邀请机器人](https://www.kookapp.cn/app/oauth2/authorize?id=44930&permissions=0&bot_id=0&scope=bot)\n\n` +
      `2️⃣ **邀请成功后，回到这里回复任意消息（如"成功"）**\n` +
      `   我会自动发送你的专属邀请码\n\n` +
      `3️⃣ **使用邀请码前往官网注册**\n` +
      `   [http://22bngm.online/join](http://22bngm.online/join)\n\n` +
      `> ⚠️ 由于 KOOK 平台限制，邀请后需要您先在此回复一条消息，我才能发送邀请码。\n\n` +
      `如已邀请机器人但未收到邀请码，请发送 **\`/试用\`** 重新获取。`;

    try {
      await this.kookService.sendDirectMessage(userId, msg, 9);
    } catch (err) {
      this.logger.error(`发送邀请码引导失败: ${err}`);
    }
  }

  /** 关键词"/帮助" → 返回帮助信息 */
  private async replyHelp(userId: string): Promise<void> {
    const msg =
      `**📖 公会管理助手 — 使用指南**\n\n` +
      `**私信指令：**\n` +
      `\`/帮助\` — 查看本帮助\n` +
      `\`/试用\` — 获取邀请码（需先邀请Bot到服务器）\n` +
      `\`邀请码\` — 了解如何获取邀请码\n\n` +
      `**频道功能（需在已注册的服务器中）：**\n` +
      `• 发送装备截图 → 自动OCR识别并创建补装申请\n` +
      `• 发送击杀详情截图 → 自动识别装备并批量创建补装\n\n` +
      `**管理后台：**\n` +
      `[http://22bngm.online](http://22bngm.online)`;

    try {
      await this.kookService.sendDirectMessage(userId, msg, 9);
    } catch (err) {
      this.logger.error(`发送帮助信息失败: ${err}`);
    }
  }

  /** 关键词"/试用" → 引导邀请 Bot */
  private async replyTrial(userId: string): Promise<void> {
    // 检查该用户是否有 Bot 加入记录（是某个服务器的主人）
    const record = await this.joinRecordRepo.findOne({ where: { inviterKookId: userId, status: 'pending' } });
    if (record) {
      const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://22bngm.online';
      // 查询该记录关联的邀请码，补全 ?code=xxx
      let codeSuffix = '';
      let codeText = '';
      if (record.inviteCodeId) {
        const invite = await this.inviteRepo.findOne({ where: { id: record.inviteCodeId } });
        if (invite && invite.status === InviteCodeStatus.ENABLED) {
          codeSuffix = `?code=${invite.code}`;
          codeText = `\n\n您的专属邀请码：\`${invite.code}\``;
        }
      }
      const msg =
        `**🎉 检测到你的服务器 ${record.guildName || record.kookGuildId} 已添加了机器人！**\n\n` +
        `请使用以下链接注册管理后台：\n` +
        `[${baseUrl}/join${codeSuffix}](${baseUrl}/join${codeSuffix})${codeText}\n\n` +
        `如已有邀请码，直接在注册页输入即可。`;
      await this.kookService.sendDirectMessage(userId, msg, 9);
    } else {
      const msg =
        `**📢 试用公会管理助手**\n\n` +
        `请先将我邀请到你的 KOOK 服务器：\n` +
        `[👉 点击邀请机器人](https://www.kookapp.cn/app/oauth2/authorize?id=44930&permissions=0&bot_id=0&scope=bot)\n\n` +
        `邀请成功后我会自动给你发送邀请码。`;
      await this.kookService.sendDirectMessage(userId, msg, 9);
    }
  }

  /** 关键词匹配 */
  private matchKeyword(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some(kw => lower.includes(kw.toLowerCase()));
  }
}

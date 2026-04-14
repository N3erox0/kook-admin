import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KookService } from './kook.service';
import { BotJoinRecord } from './entities/bot-join-record.entity';
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
    private kookService: KookService,
    private configService: ConfigService,
  ) {}

  /** 处理私信消息（channel_type=PERSON） */
  async handlePrivateMessage(authorId: string, content: string): Promise<void> {
    const text = (content || '').trim();

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
      `2. 邀请成功后我会自动私信你一个邀请码\n` +
      `3. 使用邀请码前往官网注册管理后台\n\n` +
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
      `2️⃣ **邀请成功后，我会自动私信你一个邀请码**\n\n` +
      `3️⃣ **使用邀请码前往官网注册**\n` +
      `   [http://22bngm.online/join](http://22bngm.online/join)\n\n` +
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
      const msg =
        `**🎉 检测到你的服务器 ${record.guildName || record.kookGuildId} 已添加了机器人！**\n\n` +
        `请使用以下链接注册管理后台：\n` +
        `[${baseUrl}/join](${baseUrl}/join)\n\n` +
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

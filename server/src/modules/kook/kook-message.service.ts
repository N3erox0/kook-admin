import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { BotJoinRecord } from './entities/bot-join-record.entity';
import { OcrService } from '../ocr/ocr.service';
import { ResupplyService } from '../resupply/resupply.service';
import { KookService } from './kook.service';
import { KookBotInteractionService } from './kook-bot-interaction.service';
import { GuildStatus, InviteCodeStatus } from '../../common/constants/enums';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

export interface KookWebhookPayload {
  s: number;
  d: {
    verify_token?: string;
    channel_type?: string;
    type?: number;
    target_id?: string;
    author_id?: string;
    content?: string;
    msg_id?: string;
    extra?: {
      type?: string;
      body?: any;
      author?: { id: string; username: string; nickname: string };
      attachments?: { type: string; url: string; name: string }[];
      guild_id?: string;
    };
    challenge?: string;
  };
}

/** 击杀详情解析结果 */
interface KillDetailParsed {
  date: string | null;
  mapName: string | null;
  gameId: string | null;
  guildName: string | null;
  isKillDetail: boolean;
}

@Injectable()
export class KookMessageService {
  private readonly logger = new Logger(KookMessageService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(InviteCode) private inviteRepo: Repository<InviteCode>,
    @InjectRepository(BotJoinRecord) private joinRecordRepo: Repository<BotJoinRecord>,
    private kookService: KookService,
    private ocrService: OcrService,
    private resupplyService: ResupplyService,
    private botInteraction: KookBotInteractionService,
    private configService: ConfigService,
  ) {}

  async handleWebhookEvent(payload: KookWebhookPayload): Promise<any> {
    if (payload.d?.challenge) {
      return { challenge: payload.d.challenge };
    }
    if (payload.s !== 0) return { ok: true };

    const d = payload.d;

    // ===== 系统事件处理（type=255） =====
    if (d?.type === 255 && d.extra?.type) {
      return this.handleSystemEvent(d);
    }

    // ===== 私信处理（channel_type=PERSON） =====
    if (d?.channel_type === 'PERSON' && d?.author_id) {
      try {
        await this.botInteraction.handlePrivateMessage(d.author_id, d.content || '');
      } catch (err) {
        this.logger.error(`处理私信失败: ${err}`);
      }
      return { ok: true };
    }

    if (!d?.extra?.guild_id || !d?.author_id) return { ok: true };

    const guild = await this.guildRepo.findOne({ where: { kookGuildId: d.extra.guild_id, status: GuildStatus.ACTIVE } });
    if (!guild) return { ok: true };

    // 检查是否在监听频道内
    if (guild.kookListenChannelIds && guild.kookListenChannelIds.length > 0) {
      if (!guild.kookListenChannelIds.includes(d.target_id)) {
        return { ok: true };
      }
    } else if (guild.kookResupplyChannelId && d.target_id !== guild.kookResupplyChannelId) {
      return { ok: true };
    }

    const author = d.extra.author;
    const authorId = author?.id || d.author_id;
    const authorName = author?.nickname || author?.username || authorId;

    const imageUrl = this.extractImageUrl(d);
    const textContent = d.content || '';

    this.logger.log(`[频道消息] type=${d.type}, target_id=${d.target_id}, author=${authorName}(${authorId}), imageUrl=${imageUrl ? imageUrl.slice(0, 80) : 'null'}, content=${textContent.slice(0, 150)}`);

    if (imageUrl) {
      await this.processImageMessage(guild, authorId, authorName, imageUrl, textContent, d.msg_id);
    }

    return { ok: true };
  }

  /** 处理系统事件：joined_guild / guild_member_online / exited_guild 等 */
  private async handleSystemEvent(d: any): Promise<any> {
    const eventType = d.extra?.type;
    const body = d.extra?.body || {};

    switch (eventType) {
      // 模块一：机器人被邀请进入新服务器
      case 'self_joined_guild': {
        const kookGuildId = body.guild_id;
        if (!kookGuildId) return { ok: true };

        this.logger.log(`[joined_guild] Bot 加入服务器: guild_id=${kookGuildId}`);

        // 检查是否已有加入记录
        const existingRecord = await this.joinRecordRepo.findOne({ where: { kookGuildId } });
        if (existingRecord) {
          this.logger.log(`服务器 ${kookGuildId} 加入记录已存在，跳过`);
          return { ok: true };
        }

        // 获取服务器信息 + 服务器主
        let guildName = `服务器-${kookGuildId.slice(-6)}`;
        let guildIcon = '';
        let inviterKookId = '';
        let inviterUsername = '';
        let inviterIdentifyNum = '';
        let memberCount = 0;

        try {
          const guildView = await this.kookService.getGuildView(kookGuildId);
          guildName = guildView.name || guildName;
          guildIcon = guildView.icon || '';
          inviterKookId = (guildView as any).user_id || (guildView as any).master_id || '';
          memberCount = (guildView as any).member_count || 0;
          if (inviterKookId) {
            try {
              const userView = await this.kookService.getUserView(inviterKookId, kookGuildId);
              inviterUsername = (userView as any).username || '';
              inviterIdentifyNum = (userView as any).identify_num || '';
            } catch { /* ignore */ }
          }
        } catch (err) {
          this.logger.warn(`获取服务器 ${kookGuildId} 信息失败: ${err}`);
        }

        // 生成12位邀请码
        const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789';
        let inviteCodeStr = '';
        for (let i = 0; i < 12; i++) inviteCodeStr += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));
        const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

        // 写入邀请码表
        const invite = this.inviteRepo.create({
          code: inviteCodeStr,
          status: InviteCodeStatus.DISABLED,
          createSource: '02',
          remark: `BOT自动 | ${guildName} | 服务器主:${inviterKookId}`,
        });
        const savedInvite = await this.inviteRepo.save(invite);

        // 写入 bot_join_records
        const joinRecord = this.joinRecordRepo.create({
          kookGuildId,
          guildName,
          guildIcon,
          inviterKookId: inviterKookId || null,
          inviterUsername: inviterUsername || null,
          inviterIdentifyNum: inviterIdentifyNum || null,
          status: 'pending',
          inviteCodeId: savedInvite.id,
          guildMemberCount: memberCount,
          joinedAt: new Date(),
        });
        await this.joinRecordRepo.save(joinRecord);

        // 创建 pending 公会（如果不存在）
        const existingGuild = await this.guildRepo.findOne({ where: { kookGuildId } });
        if (!existingGuild) {
          const activationCode = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
          await this.guildRepo.save(this.guildRepo.create({
            name: `待激活-${guildName}`,
            kookGuildId,
            activationCode,
            invitedByKookUserId: inviterKookId || null,
            status: GuildStatus.PENDING_ACTIVATION,
          }));
        }

        // KMarkdown 私信服务器主
        if (inviterKookId) {
          const msg =
            `**🎉 感谢邀请我加入 ${guildName}！**\n\n` +
            `我是 KOOK 公会管理助手，可以帮助管理装备库存、补装申请和成员信息。\n\n` +
            `**立即开通管理后台：**\n` +
            `[👉 点击这里开始配置](${baseUrl}/join?code=${inviteCodeStr})\n\n` +
            `您的专属邀请码：\`${inviteCodeStr}\`\n\n` +
            `如有疑问，请发送 \`/帮助\` 查看使用说明。`;
          try {
            await this.kookService.sendDirectMessage(inviterKookId, msg, 9);
            this.logger.log(`邀请码 ${inviteCodeStr} 已私信发送给服务器主 ${inviterKookId}`);
          } catch (err) {
            this.logger.error(`发送邀请码私信失败: ${err}`);
          }
        }

        return { ok: true, message: 'Bot join recorded + invite code sent' };
      }

      // 模块三：成员加入 KOOK 服务器
      case 'joined_guild': {
        const guildKookId = body.guild_id;
        const memberKookId = body.user_id;
        if (!guildKookId || !memberKookId) return { ok: true };

        const guild = await this.guildRepo.findOne({ where: { kookGuildId: guildKookId, status: GuildStatus.ACTIVE } });
        if (!guild) return { ok: true };

        // 自动在 members 表创建记录
        const { GuildMember } = await import('../member/entities/guild-member.entity');
        const memberRepo = this.guildRepo.manager.getRepository(GuildMember);
        const existing = await memberRepo.findOne({ where: { guildId: guild.id, kookUserId: memberKookId } });
        if (existing) {
          if (existing.status === 'left') {
            existing.status = 'active';
            existing.leftAt = null;
            existing.joinedAt = new Date();
            existing.joinSource = 'webhook';
            existing.lastSyncedAt = new Date();
            await memberRepo.save(existing);
            this.logger.log(`[joined_guild] 成员回归: ${memberKookId} → 公会 ${guild.name}`);
          }
        } else {
          // 尝试获取用户昵称
          let nickname = memberKookId;
          try {
            const userInfo = await this.kookService.getUserView(memberKookId, guildKookId, guild.kookBotToken);
            nickname = userInfo.nickname || userInfo.username || memberKookId;
          } catch {}

          await memberRepo.save(memberRepo.create({
            guildId: guild.id,
            kookUserId: memberKookId,
            nickname,
            role: 'normal',
            status: 'active',
            joinedAt: new Date(),
            lastSyncedAt: new Date(),
            joinSource: 'webhook',
          }));
          this.logger.log(`[joined_guild] 新成员加入: ${nickname} → 公会 ${guild.name}`);
        }
        return { ok: true };
      }

      // 模块三：成员离开 KOOK 服务器
      case 'exited_guild': {
        const guildKookId = body.guild_id;
        const memberKookId = body.user_id;
        if (!guildKookId || !memberKookId) return { ok: true };

        const guild = await this.guildRepo.findOne({ where: { kookGuildId: guildKookId, status: GuildStatus.ACTIVE } });
        if (!guild) return { ok: true };

        const { GuildMember } = await import('../member/entities/guild-member.entity');
        const memberRepo = this.guildRepo.manager.getRepository(GuildMember);
        const member = await memberRepo.findOne({ where: { guildId: guild.id, kookUserId: memberKookId, status: 'active' } });
        if (member) {
          member.status = 'left';
          member.leftAt = new Date();
          member.lastSyncedAt = new Date();
          await memberRepo.save(member);
          this.logger.log(`[exited_guild] 成员离开: ${member.nickname} → 公会 ${guild.name}`);
        }
        return { ok: true };
      }

      default:
        return { ok: true };
    }
  }

  /** 处理图片消息：判断是否击杀详情 → 对应流程 */
  private async processImageMessage(
    guild: Guild, kookUserId: string, kookNickname: string,
    imageUrl: string, textContent: string, kookMessageId?: string,
  ): Promise<void> {
    try {
      const ocrResults = await this.ocrService.recognizeImage(imageUrl);
      const allText = ocrResults.map(r => r.name).join(' ');
      const killDetail = this.parseKillDetail(allText, textContent);
      const enriched = await this.ocrService.enrichWithCatalog(ocrResults);

      // 分为高置信度（>=0.8）和低置信度（<0.8）
      const highConf = enriched.filter(e => e.catalogId && e.matchScore >= 0.8);
      const lowConf = enriched.filter(e => !e.catalogId || e.matchScore < 0.8);

      // 低置信度存入 OCR 待识别工作区
      if (lowConf.length > 0) {
        try {
          await this.ocrService.createKookBatch(guild.id, imageUrl, kookUserId, kookNickname, lowConf);
          this.logger.log(`[${guild.name}] ${lowConf.length} 件低置信度装备存入待识别工作区`);
        } catch (err) {
          this.logger.error(`存入待识别工作区失败: ${err}`);
        }
      }

      if (highConf.length === 0) {
        await this.kookService.sendDirectMessage(kookUserId,
          `未能从截图中高置信度匹配到已预置的装备。${lowConf.length > 0 ? `${lowConf.length} 件已存入待识别工作区，请管理员手动确认。` : '请确认装备参考库中已录入对应装备。'}`);
        return;
      }

      const catalogIds = highConf.map(e => e.catalogId!);

      if (killDetail.isKillDetail) {
        // 击杀详情：一条记录 = 一次死亡 = 多件装备
        const result = await this.resupplyService.createFromKillDetail(guild.id, {
          kookUserId,
          kookNickname,
          screenshotUrl: imageUrl,
          killDate: killDetail.date || new Date().toISOString().slice(0, 10),
          mapName: killDetail.mapName || 'unknown',
          gameId: killDetail.gameId || kookNickname,
          guild: killDetail.guildName || guild.name,
          equipmentCatalogIds: catalogIds,
          kookMessageId,
        });

        const msg = result.skipped
          ? `补装申请已存在（去重跳过）。`
          : `收到击杀详情补装申请：${catalogIds.length} 件装备已提交。${lowConf.length > 0 ? `另有 ${lowConf.length} 件待人工确认。` : ''}`;
        await this.kookService.sendDirectMessage(kookUserId, msg);
      } else {
        // 普通补装：一条记录 = 多件装备
        const result = await this.resupplyService.create(guild.id, {
          kookUserId,
          kookNickname,
          equipmentIds: catalogIds.join(','),
          quantity: catalogIds.length,
          applyType: '死亡补装',
          screenshotUrl: imageUrl,
          kookMessageId,
        });

        if (!result['deduplicated']) {
          await this.kookService.sendDirectMessage(kookUserId,
            `收到补装申请，${catalogIds.length} 件装备已提交。${lowConf.length > 0 ? `另有 ${lowConf.length} 件待人工确认。` : ''}`);
        }
      }

      this.logger.log(`[${guild.name}] ${kookNickname} 提交补装申请 (${catalogIds.length}件)`);
    } catch (err) {
      this.logger.error(`处理图片消息失败: ${err}`);
      try {
        await this.kookService.sendDirectMessage(kookUserId,
          `补装申请处理失败，请稍后重试或联系管理员。`);
      } catch {}
    }
  }

  /** 解析击杀详情文本 — 提取日期/地图/游戏ID/公会 */
  private parseKillDetail(ocrText: string, msgText: string): KillDetailParsed {
    const combined = `${ocrText} ${msgText}`;
    const isKillDetail = /击杀详情/i.test(combined);

    if (!isKillDetail) {
      return { date: null, mapName: null, gameId: null, guildName: null, isKillDetail: false };
    }

    // 日期提取: YYYY-MM-DD 或 YYYY/MM/DD
    let date: string | null = null;
    const dateMatch = combined.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
    if (dateMatch) {
      date = dateMatch[1].replace(/\//g, '-');
    }

    // 地图名提取: 连续英文字母串（至少3字符）
    let mapName: string | null = null;
    const mapMatch = combined.match(/\b([A-Za-z]{3,30})\b/);
    if (mapMatch) {
      mapName = mapMatch[1];
    }

    // 游戏ID提取: 通常在左侧区域，格式多样
    let gameId: string | null = null;
    const idPatterns = [
      /游戏ID[：:]\s*(\S+)/i,
      /ID[：:]\s*(\S+)/i,
      /玩家[：:]\s*(\S+)/i,
    ];
    for (const p of idPatterns) {
      const m = combined.match(p);
      if (m) { gameId = m[1]; break; }
    }

    // 公会名提取
    let guildName: string | null = null;
    const guildPatterns = [
      /公会[：:]\s*(\S+)/i,
      /行会[：:]\s*(\S+)/i,
      /Guild[：:]\s*(\S+)/i,
    ];
    for (const p of guildPatterns) {
      const m = combined.match(p);
      if (m) { guildName = m[1]; break; }
    }

    return { date, mapName, gameId, guildName, isKillDetail: true };
  }

  private extractImageUrl(d: any): string | null {
    if (d.type === 2 && d.content) return d.content;
    const attachments = d.extra?.attachments || [];
    const imageAtt = attachments.find((a: any) => a.type === 'image' || a.url?.match(/\.(png|jpg|jpeg|gif|webp)/i));
    if (imageAtt) return imageAtt.url;
    const imgMatch = (d.content || '').match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (imgMatch) return imgMatch[1];
    return null;
  }
}

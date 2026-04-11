import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { OcrService } from '../ocr/ocr.service';
import { ResupplyService } from '../resupply/resupply.service';
import { KookService } from './kook.service';
import { GuildStatus } from '../../common/constants/enums';
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
    private kookService: KookService,
    private ocrService: OcrService,
    private resupplyService: ResupplyService,
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

    if (!d?.extra?.guild_id || !d?.author_id) return { ok: true };

    const guild = await this.guildRepo.findOne({ where: { kookGuildId: d.extra.guild_id } });
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
        const guildId = body.guild_id;
        const userId = body.user_id; // 邀请人
        if (!guildId) return { ok: true };

        this.logger.log(`[joined_guild] Bot 加入服务器: guild_id=${guildId}, invited_by=${userId}`);

        // 检查是否已存在
        const existing = await this.guildRepo.findOne({ where: { kookGuildId: guildId } });
        if (existing) {
          this.logger.log(`服务器 ${guildId} 已存在（状态=${existing.status}），跳过初始化`);
          return { ok: true };
        }

        // 生成激活码
        const activationCode = uuidv4().replace(/-/g, '').slice(0, 12).toUpperCase();
        const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';
        const activateLink = `${baseUrl}/join?code=${activationCode}`;

        // 创建 pending 公会
        const guild = this.guildRepo.create({
          name: `待激活-${guildId.slice(-6)}`,
          kookGuildId: guildId,
          activationCode,
          invitedByKookUserId: userId || null,
          status: GuildStatus.PENDING_ACTIVATION,
        });
        await this.guildRepo.save(guild);

        // 私信邀请人
        if (userId) {
          const msg = `🎉 **公会管理助手已加入你的服务器！**\n\n请点击以下链接完成公会注册：\n${activateLink}\n\n激活码：\`${activationCode}\`\n\n⚠️ 此激活码为一次性使用，仅限首次注册。`;
          try {
            await this.kookService.sendDirectMessage(userId, msg);
            this.logger.log(`激活链接已私信发送给 ${userId}`);
          } catch (err) {
            this.logger.error(`发送激活私信失败: ${err}`);
          }
        }

        return { ok: true, message: 'Guild pending activation created' };
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
      // OCR 识别
      const ocrResults = await this.ocrService.recognizeImage(imageUrl);
      const allText = ocrResults.map(r => r.name).join(' ');

      // 判断是否为击杀详情图片
      const killDetail = this.parseKillDetail(allText, textContent);

      if (killDetail.isKillDetail) {
        // 击杀详情模式：解析装备 → 批量创建补装申请（含去重）
        const enriched = await this.ocrService.enrichWithCatalog(ocrResults);
        const equipments = enriched
          .filter(e => e.catalogId || e.matchScore > 0.5)
          .map(e => ({
            name: e.catalogName || e.name,
            level: e.level,
            quality: e.quality,
            gearScore: e.gearScore,
            category: e.category,
            catalogId: e.catalogId,
          }));

        if (equipments.length === 0) {
          await this.kookService.sendDirectMessage(kookUserId,
            `识别到击杀详情，但未能匹配到装备。请确认图片清晰度。`);
          return;
        }

        const result = await this.resupplyService.createFromKillDetail(guild.id, {
          kookUserId,
          kookNickname,
          screenshotUrl: imageUrl,
          killDate: killDetail.date || new Date().toISOString().slice(0, 10),
          mapName: killDetail.mapName || 'unknown',
          gameId: killDetail.gameId || kookNickname,
          guild: killDetail.guildName || guild.name,
          equipments,
          kookMessageId,
        });

        const msg = result.skipped > 0
          ? `收到击杀详情补装申请：创建 ${result.created} 件，跳过 ${result.skipped} 件（已存在）。`
          : `收到击杀详情补装申请：共 ${result.created} 件装备已提交。`;
        await this.kookService.sendDirectMessage(kookUserId, msg);
      } else {
        // 普通补装模式
        const enriched = await this.ocrService.enrichWithCatalog(ocrResults);
        if (enriched.length === 0) {
          await this.kookService.sendDirectMessage(kookUserId,
            `未能从截图中识别到装备信息，请确认图片清晰度后重试。`);
          return;
        }

        let createdCount = 0;
        for (const item of enriched) {
          try {
            const result = await this.resupplyService.create(guild.id, {
              kookUserId,
              kookNickname,
              equipmentName: item.catalogName || item.name,
              level: item.level,
              quality: item.quality,
              gearScore: item.gearScore,
              category: item.category,
              quantity: item.quantity || 1,
              applyType: '补装',
              screenshotUrl: imageUrl,
              kookMessageId: kookMessageId ? `${kookMessageId}_${createdCount}` : undefined,
            });
            if (!result['deduplicated']) createdCount++;
          } catch (err) {
            this.logger.error(`创建补装申请失败: ${err}`);
          }
        }

        await this.kookService.sendDirectMessage(kookUserId,
          `收到补装申请，共 ${createdCount} 件装备已提交。`);
      }

      this.logger.log(`[${guild.name}] ${kookNickname} 提交补装申请`);
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

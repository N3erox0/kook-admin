import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { BotJoinRecord } from './entities/bot-join-record.entity';
import { OcrService } from '../ocr/ocr.service';
import { ImageMatchService } from '../ocr/image-match.service';
import { CatalogService } from '../equipment-catalog/catalog.service';
import { ResupplyService } from '../resupply/resupply.service';
import { KookService } from './kook.service';
import { KookBotInteractionService } from './kook-bot-interaction.service';
import { GuildStatus, InviteCodeStatus } from '../../common/constants/enums';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

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
    private imageMatchService: ImageMatchService,
    private catalogService: CatalogService,
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

    const imageUrls = this.extractAllImageUrls(d);
    const textContent = d.content || '';

    this.logger.log(`[频道消息] type=${d.type}, target_id=${d.target_id}, author=${authorName}(${authorId}), images=${imageUrls.length}, content=${textContent.slice(0, 150)}`);

    if (imageUrls.length > 0) {
      // 多图逐张处理
      for (const imgUrl of imageUrls) {
        await this.processImageMessage(guild, authorId, authorName, imgUrl, textContent, d.msg_id);
      }
    } else if (this.isOcBrokenMessage(textContent)) {
      await this.processOcBrokenMessage(guild, authorId, authorName, textContent, d.msg_id);
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

        this.logger.log(`[self_joined_guild] Bot 加入服务器: guild_id=${kookGuildId}`);
        this.logger.log(`[self_joined_guild] 原始 body: ${JSON.stringify(body)}`);
        this.logger.log(`[self_joined_guild] d.author_id=${d.author_id}, extra.author=${JSON.stringify(d.extra?.author || null)}`);

        // ========== 先查公会是否已绑定成功（ACTIVE）==========
        const boundGuild = await this.guildRepo.findOne({ where: { kookGuildId } });
        if (boundGuild && boundGuild.status === GuildStatus.ACTIVE) {
          this.logger.log(`[self_joined_guild] 服务器 ${kookGuildId} 已绑定公会 "${boundGuild.name}" (ACTIVE)，跳过邀请流程`);
          // 刷新 bot_join_records 的 joinedAt 时间（如有记录）
          const rec = await this.joinRecordRepo.findOne({ where: { kookGuildId } });
          if (rec) {
            rec.joinedAt = new Date();
            rec.status = 'activated';
            await this.joinRecordRepo.save(rec);
          }
          return { ok: true, message: 'Guild already activated, skip invite' };
        }

        // ========== 获取服务器信息 + 识别邀请者 ==========
        let guildName = `服务器-${kookGuildId.slice(-6)}`;
        let guildIcon = '';
        let inviterKookId = '';
        let inviterUsername = '';
        let inviterIdentifyNum = '';
        let memberCount = 0;

        // 优先从 webhook body 取邀请者（KOOK 可能在 body.user_id / body.operator_id 提供）
        const bodyUserId = body.user_id || body.operator_id || '';
        // 也检查 d.author_id（某些事件格式下会带）
        const dAuthorId = d.author_id || '';

        try {
          const guildView = await this.kookService.getGuildView(kookGuildId);
          guildName = guildView.name || guildName;
          guildIcon = guildView.icon || '';
          const masterId = (guildView as any).user_id || (guildView as any).master_id || '';
          memberCount = (guildView as any).member_count || 0;

          // 邀请者识别优先级：body.user_id > d.author_id > master_id
          // body.user_id 和 d.author_id 可能是 Bot 自身（3532242146），需排除
          const botSelfId = '3532242146'; // TODO: 从 /me 接口动态获取，暂硬编码
          if (bodyUserId && bodyUserId !== '1' && bodyUserId !== botSelfId) {
            inviterKookId = bodyUserId;
            this.logger.log(`[self_joined_guild] 邀请者来源: body.user_id=${bodyUserId}`);
          } else if (dAuthorId && dAuthorId !== '1' && dAuthorId !== botSelfId) {
            inviterKookId = dAuthorId;
            this.logger.log(`[self_joined_guild] 邀请者来源: d.author_id=${dAuthorId}`);
          } else {
            inviterKookId = masterId;
            this.logger.log(`[self_joined_guild] 邀请者来源: master_id=${masterId}（兜底）`);
          }

          if (inviterKookId) {
            try {
              const userView = await this.kookService.getUserView(inviterKookId, kookGuildId);
              inviterUsername = (userView as any).username || '';
              inviterIdentifyNum = (userView as any).identify_num || '';
            } catch { /* ignore */ }
          }
        } catch (err) {
          // API 失败时仍优先用 body 里的邀请者
          if (bodyUserId && bodyUserId !== '1') {
            inviterKookId = bodyUserId;
            this.logger.log(`[self_joined_guild] API失败但从body取到邀请者: ${bodyUserId}`);
          } else if (dAuthorId && dAuthorId !== '1') {
            inviterKookId = dAuthorId;
            this.logger.log(`[self_joined_guild] API失败但从d.author_id取到邀请者: ${dAuthorId}`);
          }
          this.logger.warn(`[self_joined_guild] 获取服务器 ${kookGuildId} 信息失败: ${err}`);
        }

        // ========== 复用或生成邀请码 ==========
        const existingRecord = await this.joinRecordRepo.findOne({ where: { kookGuildId } });
        let savedInvite: InviteCode | null = null;
        let reused = false;

        if (existingRecord?.inviteCodeId) {
          // 重进场景：尝试复用原邀请码
          const oldInvite = await this.inviteRepo.findOne({ where: { id: existingRecord.inviteCodeId } });
          if (oldInvite && oldInvite.status === InviteCodeStatus.ENABLED) {
            savedInvite = oldInvite;
            reused = true;
            this.logger.log(`[self_joined_guild] 复用原邀请码 ${oldInvite.code} (id=${oldInvite.id}) 给服务器 ${kookGuildId}`);
          } else {
            this.logger.log(`[self_joined_guild] 原邀请码状态=${oldInvite?.status || 'NULL'}，不可复用，将生成新邀请码`);
          }
        }

        if (!savedInvite) {
          // 首次加入 或 原邀请码已失效 → 生成新邀请码
          // 12位：大小写字母去 I/O/i/o + 数字 0-9，共58字符
          const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz0123456789';
          let inviteCodeStr = '';
          for (let i = 0; i < 12; i++) inviteCodeStr += CHARSET.charAt(Math.floor(Math.random() * CHARSET.length));

          const invite = this.inviteRepo.create({
            code: inviteCodeStr,
            status: InviteCodeStatus.ENABLED,
            createSource: '02',
            remark: `BOT自动 | ${guildName} | 服务器主:${inviterKookId || '未知'}`,
          });
          savedInvite = await this.inviteRepo.save(invite);
          this.logger.log(`[self_joined_guild] 生成新邀请码 ${inviteCodeStr} (id=${savedInvite.id}) 给服务器 ${kookGuildId}`);
        }

        // ========== 写入/更新 bot_join_records ==========
        if (existingRecord) {
          existingRecord.guildName = guildName;
          existingRecord.guildIcon = guildIcon;
          if (inviterKookId) existingRecord.inviterKookId = inviterKookId;
          if (inviterUsername) existingRecord.inviterUsername = inviterUsername;
          if (inviterIdentifyNum) existingRecord.inviterIdentifyNum = inviterIdentifyNum;
          existingRecord.inviteCodeId = savedInvite.id;
          existingRecord.guildMemberCount = memberCount || existingRecord.guildMemberCount;
          existingRecord.joinedAt = new Date();
          existingRecord.status = 'pending';
          await this.joinRecordRepo.save(existingRecord);
        } else {
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
        }

        // ========== 创建/更新 pending 公会 ==========
        if (!boundGuild) {
          // 激活码：12位，大小写字母去I/O/i/o + 数字0-9
          const ACTIVATION_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjklmnpqrstuvwxyz0123456789';
          let activationCode = '';
          for (let i = 0; i < 12; i++) activationCode += ACTIVATION_CHARSET.charAt(Math.floor(Math.random() * ACTIVATION_CHARSET.length));
          await this.guildRepo.save(this.guildRepo.create({
            name: `待激活-${guildName}`,
            kookGuildId,
            activationCode,
            inviteCodeId: savedInvite.id,
            invitedByKookUserId: inviterKookId || null,
            status: GuildStatus.PENDING_ACTIVATION,
          }));
        } else if (!boundGuild.inviteCodeId || boundGuild.inviteCodeId !== savedInvite.id) {
          boundGuild.inviteCodeId = savedInvite.id;
          if (!boundGuild.invitedByKookUserId && inviterKookId) {
            boundGuild.invitedByKookUserId = inviterKookId;
          }
          await this.guildRepo.save(boundGuild);
        }

        // ========== KMarkdown 私信服务器主 ==========
        if (inviterKookId) {
          const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';
          const headerEmoji = reused ? '🔔' : '🎉';
          const headerText = reused
            ? `**${headerEmoji} 欢迎回来，${guildName}！**\n\n这是您之前未完成绑定的邀请码，仍然有效：`
            : `**${headerEmoji} 感谢邀请我加入 ${guildName}！**\n\n我是 KOOK 公会管理助手，可以帮助管理装备库存、补装申请和成员信息。`;
          const msg =
            `${headerText}\n\n` +
            `**立即开通管理后台：**\n` +
            `[👉 点击这里开始配置](${baseUrl}/join?code=${savedInvite.code})\n\n` +
            `您的专属邀请码：\`${savedInvite.code}\`\n\n` +
            `该邀请码在公会绑定成功前始终有效，可重复使用。\n` +
            `如有疑问，请发送 \`/帮助\` 查看使用说明。`;
          const dmOk = await this.kookService.sendDirectMessage(inviterKookId, msg, 9);
          if (dmOk) {
            this.logger.log(`[self_joined_guild] ✅ 邀请码 ${savedInvite.code} 已${reused ? '重新' : ''}私信发送给服务器主 ${inviterKookId}`);
          } else {
            // 标记 dm_failed，用户后续主动私聊 Bot 时由 KookBotInteractionService 自动补发
            this.logger.warn(`[self_joined_guild] ⚠️ 私信发送失败(KOOK要求用户先私聊过Bot)，已标记 dm_failed；用户 ${inviterKookId} 私聊 Bot 后将自动补发`);
            try {
              const rec = await this.joinRecordRepo.findOne({ where: { kookGuildId } });
              if (rec) {
                rec.status = 'dm_failed';
                await this.joinRecordRepo.save(rec);
              }
            } catch (err) {
              this.logger.error(`[self_joined_guild] 标记 dm_failed 失败: ${err}`);
            }
          }
        } else {
          this.logger.warn(`[self_joined_guild] 未识别到服务器主 inviter_kook_id，邀请码 ${savedInvite.code} 已生成但未发送私信`);
        }

        return { ok: true, message: reused ? 'Invite code reused + DM resent' : 'New invite code sent', code: savedInvite.code, reused };
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

  /**
   * V2.9.6 重构：处理图片消息
   * - F-149: 只处理含"击杀详情"/"擊殺詳細資訊"的图片，其他图片直接跳过
   * - F-150: pHash全失败也创建pending记录（空装备，管理员手动补）
   * - F-151: 消息自带文字存入reason字段
   * - F-155: 支持繁体关键词
   */
  private async processImageMessage(
    guild: Guild, kookUserId: string, kookNickname: string,
    imageUrl: string, textContent: string, kookMessageId?: string,
  ): Promise<void> {
    try {
      // Step 1: OCR 识别文字+坐标
      const { texts, detections } = await this.ocrService.recognizeImageWithCoords(imageUrl);
      const allText = texts.join(' ');
      const killDetail = this.parseKillDetail(allText, textContent);

      this.logger.log(`[${guild.name}] OCR文字: "${allText.slice(0, 200)}", 是否击杀详情=${killDetail.isKillDetail}`);

      // F-149: 非击杀详情图片直接跳过
      if (!killDetail.isKillDetail) {
        this.logger.log(`[${guild.name}] 非击杀详情图片，跳过处理`);
        return;
      }

      // Step 2: 下载图片为 Buffer
      const imageBuffer = await this.fetchImageBuffer(imageUrl);
      if (!imageBuffer) {
        this.logger.warn('图片下载失败，跳过处理');
        return;
      }

      // Step 3: pHash 匹配装备（仅击杀详情流程）
      let matchResults: any[] = [];

      // V2.9.7 F-156: 优先使用固定格子分类匹配（左面板3×4网格，每格只匹配对应category）
      const leftRegion = this.detectLeftPanel(detections, imageBuffer);
      if (leftRegion) {
        try {
          const sharp = require('sharp');
          const leftPanelBuf = await sharp(imageBuffer)
            .extract({ left: leftRegion.left, top: leftRegion.top, width: leftRegion.width, height: leftRegion.height })
            .toBuffer();
          matchResults = await this.imageMatchService.matchKillDetailSlots(leftPanelBuf);
          this.logger.log(`[${guild.name}] V2.9.7 击杀详情分类匹配: ${matchResults.length} 件`);
        } catch (err) {
          this.logger.warn(`V2.9.7 分类匹配失败，降级为全图匹配: ${err}`);
        }
      }
      // 分类匹配无结果时降级为全图匹配
      if (matchResults.length === 0) {
        try {
          matchResults = await this.imageMatchService.matchFromScreenshot(imageBuffer);
          this.logger.log(`[${guild.name}] 全图pHash匹配(降级): ${matchResults.length} 件`);
        } catch (err) {
          this.logger.warn(`全图pHash匹配失败: ${err}`);
        }
      }

      // Step 4: 取高置信度结果（≥0.70），最多10件
      const highConf = matchResults.filter(m => m.confidence >= 0.70);
      const MAX_ITEMS = 10;
      const limitedHighConf = highConf.sort((a, b) => b.confidence - a.confidence).slice(0, MAX_ITEMS);

      // Step 5: 构建补装记录参数
      const catalogIds = limitedHighConf.map(m => m.catalogId);
      const dateStr = killDetail.date || new Date().toISOString().slice(0, 10);

      // 去重哈希（即使0件装备也用截图+日期+人生成hash）
      const contentDedupHash = crypto.createHash('md5')
        .update(`${imageUrl}|${dateStr}|${kookUserId}`)
        .digest('hex');
      const existingContent = await this.resupplyService.findByDedupHash(guild.id, contentDedupHash);
      if (existingContent) {
        this.logger.log(`[${guild.name}] 内容级去重命中，跳过`);
        return;
      }

      // F-151: 消息自带文字存入reason（击杀详情元数据 + 原始文字）
      const metaReason = `击杀详情 | 日期:${killDetail.date || '未知'} | 地图:${killDetail.mapName || '未知'} | 游戏ID:${killDetail.gameId || '未知'}`;
      const reason = textContent && textContent !== imageUrl
        ? `${metaReason} | 备注:${textContent.slice(0, 200)}`
        : metaReason;

      // F-150: 不管匹配到几件装备（哪怕0件），都创建一条pending记录
      const killDto: any = {
        kookUserId, kookNickname,
        screenshotUrl: imageUrl,
        killDate: killDetail.date || dateStr,
        mapName: killDetail.mapName || 'unknown',
        gameId: killDetail.gameId || kookNickname,
        guild: killDetail.guildName || guild.name,
        equipmentCatalogIds: catalogIds, // 可能为空数组
        kookMessageId,
        _dedupHash: contentDedupHash,
        _reason: reason,
      };
      const result = await this.resupplyService.createFromKillDetail(guild.id, killDto);

      if (result.skipped) {
        this.logger.log(`[${guild.name}] 补装去重命中，跳过`);
      } else {
        // V2.9.7: 暂停私信通知，待重新设计通知规则
        this.logger.log(`[${guild.name}] ${kookNickname} 击杀详情补装记录已创建 (${catalogIds.length}件装备)`);
      }
    } catch (err) {
      this.logger.error(`处理图片消息失败: ${err}`);
    }
  }

  // ===== OC碎文字消息处理 =====

  /** V2.9.6 F-153: 检测是否为含"碎"字的补装消息 */
  private isOcBrokenMessage(text: string): boolean {
    return /碎/.test(text);
  }

  /**
   * 处理OC碎文字消息
   * 逻辑：拆词 → 逐个与参考库全名/别称匹配 → 全匹配创建补装，有未匹配进待识别工作区
   */
  private async processOcBrokenMessage(
    guild: Guild, kookUserId: string, kookNickname: string,
    textContent: string, kookMessageId?: string,
  ): Promise<void> {
    try {
      this.logger.log(`[${guild.name}] OC碎消息: ${kookNickname} → "${textContent.slice(0, 200)}"`);

      // 解析装备词段（去除OC碎关键词+纯数字+分隔符）
      const segments = this.parseOcBrokenSegments(textContent);
      this.logger.log(`[${guild.name}] OC碎拆词: ${segments.length} 个词段: [${segments.join(', ')}]`);

      // F-108: 字数分段与关键词不一致（含OC碎但拆不出有效词段）→ 整条进待识别工作区
      if (segments.length === 0) {
        this.logger.log(`[${guild.name}] OC碎无有效装备词段，整条进待识别工作区`);
        try {
          await this.ocrService.createKookBatch(guild.id, null, kookUserId, kookNickname, [{
            name: textContent.slice(0, 100) || 'OC碎未识别',
            catalogId: null, catalogName: null,
            level: null, quality: null, category: null,
            gearScore: null, quantity: 1, matchScore: 0,
          }] as any);
        } catch (err) {
          this.logger.error(`OC碎空段存入待识别失败: ${err}`);
        }
        const msg = 'OC碎消息未识别到有效装备词段，已存入待识别工作区，请管理员手动确认。';
        // V2.9.7: 暂停私信通知
        this.logger.log(`[${guild.name}] ${msg}`);
        return;
      }

      // 逐个与参考库匹配（全名+别称）
      const matchedIds: number[] = [];
      const matchedNames: string[] = [];
      const unmatchedSegments: string[] = [];

      for (const seg of segments) {
        // 提取可能的等级品质前缀："80牧师风帽" → name="牧师风帽", level=8, quality=0
        const parsed = this.extractLevelQualityFromSegment(seg);
        const searchName = parsed.name;

        if (!searchName || searchName.length < 2) {
          unmatchedSegments.push(seg);
          continue;
        }

        const matches = await this.catalogService.findByNameFuzzy(searchName, 0.75);
        if (matches.length > 0) {
          let best = matches[0];
          // 优先精确等级+品质匹配
          if (parsed.level !== undefined) {
            const lvMatch = matches.find(m => m.item.level === parsed.level);
            if (lvMatch) best = lvMatch;
          }
          if (parsed.level !== undefined && parsed.quality !== undefined) {
            const lqMatch = matches.find(m => m.item.level === parsed.level && m.item.quality === parsed.quality);
            if (lqMatch) best = lqMatch;
          }
          for (let i = 0; i < (parsed.quantity || 1); i++) {
            matchedIds.push(best.item.id);
          }
          matchedNames.push(`${best.item.name}(x${parsed.quantity || 1})`);
        } else {
          unmatchedSegments.push(seg);
        }
      }

      this.logger.log(`[${guild.name}] OC碎匹配结果: ${matchedIds.length}件匹配[${matchedNames.join(',')}], ${unmatchedSegments.length}件未匹配[${unmatchedSegments.join(',')}]`);

      // 去重检查
      const dedupHash = require('crypto').createHash('md5')
        .update(`${textContent}|${new Date().toISOString().slice(0, 10)}|${kookUserId}`)
        .digest('hex');
      const existingDedup = await this.resupplyService.findByDedupHash(guild.id, dedupHash);
      if (existingDedup) {
        this.logger.log(`[${guild.name}] OC碎去重命中，跳过: ${kookNickname}`);
        return;
      }

      // 有未匹配词段 → 整条进待识别工作区（不创建补装申请）
      if (unmatchedSegments.length > 0) {
        try {
          const items = segments.map(seg => {
            const parsed = this.extractLevelQualityFromSegment(seg);
            return {
              name: parsed.name || seg, catalogId: null, catalogName: null,
              level: parsed.level, quality: parsed.quality, category: null,
              gearScore: null, quantity: parsed.quantity || 1, matchScore: 0,
            };
          });
          await this.ocrService.createKookBatch(guild.id, null, kookUserId, kookNickname, items as any);
          this.logger.log(`[${guild.name}] OC碎有未匹配词段，整条存入待识别工作区`);
        } catch (err) {
          this.logger.error(`OC碎存入待识别失败: ${err}`);
        }
        const msg = `OC碎消息中有${unmatchedSegments.length}个未识别词段（${unmatchedSegments.join('、')}），已存入待识别工作区，请管理员手动确认。`;
        // V2.9.7: 暂停私信通知
        this.logger.log(`[${guild.name}] ${msg}`);
        return;
      }

      // 全部匹配 → 创建补装申请
      if (matchedIds.length > 0) {
        const createDto: any = {
          kookUserId, kookNickname,
          equipmentIds: matchedIds.join(','),
          quantity: matchedIds.length,
          applyType: 'OC碎',
          reason: textContent,
          kookMessageId,
          _dedupHash: dedupHash,
        };
        await this.resupplyService.create(guild.id, createDto);

        // V2.9.7: 暂停私信通知
        this.logger.log(`[${guild.name}] ${kookNickname} OC碎补装创建成功: ${matchedIds.length}件`);
      }
    } catch (err) {
      this.logger.error(`处理OC碎消息失败: ${err}`);
    }
  }

  /**
   * V2.9.6 F-154: OC碎文字拆词
   * 以第一个"碎"字为分界，"碎"后文字作为装备描述区
   * 纯数字段与下一段合并（如"80 牧师风帽"→"80牧师风帽"）
   */
  private parseOcBrokenSegments(text: string): string[] {
    // F-154: 找到第一个"碎"字的位置，取"碎"之后的文字作为装备区
    const suiIndex = text.indexOf('碎');
    let equipArea = suiIndex >= 0 ? text.slice(suiIndex + 1).trim() : text.trim();
    
    // 如果"碎"后面紧跟"了"，跳过"了"
    if (equipArea.startsWith('了')) {
      equipArea = equipArea.slice(1).trim();
    }

    const rawSegments = equipArea.split(/[,，、\s]+/).filter(s => s.trim().length > 0);

    // 合并：纯数字段（如"80"）与下一个非数字段合并为"80牧师风帽"
    // 同理 "P8" / "平8" 等装等前缀也与下一段合并
    const merged: string[] = [];
    for (let i = 0; i < rawSegments.length; i++) {
      const seg = rawSegments[i].trim();
      if (!seg) continue;

      // 纯数字或装等前缀（P8/平8等） → 与下一段合并
      if (/^(\d{1,2}|[pP]\d{1,2}|平\d?)$/.test(seg) && i + 1 < rawSegments.length) {
        const next = rawSegments[i + 1].trim();
        if (next && !/^\d+$/.test(next)) {
          merged.push(seg + next);
          i++; // 跳过下一段
          continue;
        }
      }

      if (seg.length < 2) continue;
      merged.push(seg);
    }

    return merged;
  }

  /**
   * 从词段提取等级品质前缀
   * "80牧师风帽" → { name:"牧师风帽", level:8, quality:0 }
   * "P9重锤" → { name:"重锤", level:8, quality:1 }
   * "牧师风帽" → { name:"牧师风帽" }
   */
  private extractLevelQualityFromSegment(seg: string): { name: string; level?: number; quality?: number; quantity?: number } {
    let s = seg.trim();
    let level: number | undefined;
    let quality: number | undefined;
    let quantity: number | undefined;

    // 提取数量："3个xxx"
    const qtyMatch = s.match(/(\d+)\s*个/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1]);
      s = s.replace(qtyMatch[0], '').trim();
    }

    // 品质前缀："平xxx"=Q0
    if (s.startsWith('平')) {
      quality = 0;
      s = s.slice(1);
    }

    // 两位数字前缀："80牧师风帽" → level=8, quality=0
    const lvQMatch = s.match(/^(\d)(\d)(.+)/);
    if (lvQMatch && lvQMatch[3].length >= 2) {
      const lv = parseInt(lvQMatch[1]);
      const q = parseInt(lvQMatch[2]);
      if (lv >= 1 && lv <= 8 && q >= 0 && q <= 4) {
        level = lv;
        quality = q;
        s = lvQMatch[3].trim();
      }
    }

    // 装等前缀："P9重锤"
    if (!level) {
      const gsMatch = s.match(/^[pP](\d{1,2})(.+)/);
      if (gsMatch && gsMatch[2].length >= 2) {
        const gs = parseInt(gsMatch[1]);
        if (gs >= 1 && gs <= 12) {
          level = Math.min(gs, 8);
          quality = Math.max(0, gs - (level || 0));
          s = gsMatch[2].trim();
        }
      }
    }

    return { name: s, level, quality, quantity: quantity || 1 };
  }

  // ===== 击杀详情定位 =====

  /**
   * V2.9.8: 基于OCR文字坐标精确定位左面板装备区域
   * 策略：
   * - "击杀详情"文字作为锚点
   * - "击杀"文字的x坐标 = 中轴线 = 左面板右边界
   * - 上边界 = 找到玩家信息区（昵称/公会/IP行）下方
   * - 下边界 = "另存为新模板"或"击杀声望"文字上方
   */
  private detectLeftPanel(detections: { text: string; x: number; y: number; width: number; height: number }[],
    imageBuffer: Buffer): { left: number; top: number; width: number; height: number } | null {
    if (!detections || detections.length === 0) return null;

    // 找"击杀详情"的位置（弹窗标题锚点）
    const killDetailIdx = detections.findIndex(d => /击杀详情/.test(d.text));
    if (killDetailIdx < 0) return null;

    const anchor = detections[killDetailIdx];
    const estimatedPopupWidth = anchor.width * 3.5;

    // 找"击杀"文字（中间剑图标位置）作为左右分界
    const killTextIdx = detections.findIndex(d => d.text === '击杀' && d.width < 150 && d.y > anchor.y + anchor.height);
    // 找底部标记
    const bottomIdx = detections.findIndex(d => /击杀声望|另存为新模板/.test(d.text));

    // 弹窗左边界
    const popupLeft = Math.max(0, anchor.x - 10);

    // 左面板右边界：优先用"击杀"文字的x（中轴线）
    let leftPanelRight: number;
    if (killTextIdx >= 0) {
      leftPanelRight = detections[killTextIdx].x - 5;
    } else {
      leftPanelRight = popupLeft + Math.round(estimatedPopupWidth * 0.45);
    }

    // V2.9.8: 上边界优化 — 尝试找IP/数字行（如"1432"/"1569"）的y坐标作为装备区起点
    // IP行通常在玩家信息区最后一行，格式为纯数字4位
    let topY: number;
    const ipLineIdx = detections.findIndex(d =>
      /^\d{3,4}$/.test(d.text.trim()) && d.x < leftPanelRight && d.y > anchor.y + anchor.height
    );
    if (ipLineIdx >= 0) {
      // IP行下方就是装备区
      topY = detections[ipLineIdx].y + detections[ipLineIdx].height + 5;
    } else {
      // 降级：击杀详情标题下方约4行
      topY = anchor.y + anchor.height * 4;
    }

    // 下边界
    let bottomY: number;
    if (bottomIdx >= 0) {
      bottomY = detections[bottomIdx].y - 5;
    } else {
      bottomY = anchor.y + Math.round(estimatedPopupWidth * 0.85);
    }

    const regionLeft = popupLeft;
    const regionWidth = Math.max(50, Math.round(leftPanelRight - popupLeft));
    const regionHeight = Math.max(50, Math.round(bottomY - topY));

    // 安全检查
    const maxWidth = Math.round(estimatedPopupWidth * 0.5);
    const safeWidth = Math.min(regionWidth, maxWidth);

    if (safeWidth < 50 || regionHeight < 50) return null;

    this.logger.log(`[V2.9.8 detectLeftPanel] 锚点"击杀详情": x=${anchor.x},y=${anchor.y},w=${anchor.width} → 左面板: left=${regionLeft},top=${Math.round(topY)},${safeWidth}x${regionHeight}`);

    return { left: regionLeft, top: Math.round(topY), width: safeWidth, height: regionHeight };
  }

  /** 下载图片为 Buffer */
  private async fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
    try {
      const response = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }

  /** 解析击杀详情文本 — 提取日期/地图/游戏ID/公会 */
  private parseKillDetail(ocrText: string, msgText: string): KillDetailParsed {
    const combined = `${ocrText} ${msgText}`;
    const isKillDetail = /击杀详情|擊殺詳細資訊|擊殺詳情/i.test(combined);

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

  /** 提取消息中所有图片URL（支持一条消息多张图） */
  private extractAllImageUrls(d: any): string[] {
    const urls: string[] = [];

    // 1. type=2 纯图片消息
    if (d.type === 2 && d.content) { urls.push(d.content); return urls; }

    // 2. type=10 卡片消息 — 提取所有 image.src
    if (d.type === 10 && d.content) {
      try {
        const cards = typeof d.content === 'string' ? JSON.parse(d.content) : d.content;
        if (Array.isArray(cards)) {
          for (const card of cards) {
            for (const mod of (card.modules || [])) {
              if (mod.elements && Array.isArray(mod.elements)) {
                for (const el of mod.elements) {
                  if (el.type === 'image' && el.src) urls.push(el.src);
                }
              }
              if (mod.type === 'image' && mod.src) urls.push(mod.src);
            }
          }
        }
      } catch (err) {
        this.logger.warn(`解析卡片消息图片失败: ${err}`);
      }
      if (urls.length > 0) return urls;
    }

    // 3. type=9 KMarkdown — 提取所有图片URL
    if (d.type === 9 && d.content) {
      const kmdMatches = (d.content as string).matchAll(/\[.*?\]\((https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|gif|webp)[^\s)]*)\)/gi);
      for (const m of kmdMatches) urls.push(m[1]);
      if (urls.length === 0) {
        const plainMatches = (d.content as string).matchAll(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)[^\s]*)/gi);
        for (const m of plainMatches) urls.push(m[1]);
      }
      if (urls.length > 0) return urls;
    }

    // 4. attachments（可能有多个）
    const attachments = d.extra?.attachments || [];
    for (const a of attachments) {
      if (a.type === 'image' || a.url?.match(/\.(png|jpg|jpeg|gif|webp)/i)) {
        urls.push(a.url);
      }
    }
    if (urls.length > 0) return urls;

    // 5. Markdown 图片语法
    const mdMatches = (d.content || '').matchAll(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g);
    for (const m of mdMatches) urls.push(m[1]);
    if (urls.length > 0) return urls;

    // 6. 通用URL兜底
    const genericMatches = (d.content || '').matchAll(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi);
    for (const m of genericMatches) urls.push(m[1]);

    return urls;
  }

  /**
   * V2.9.5: 主动拉取监听频道历史消息并按现有逻辑处理
   * 遍历公会的所有监听频道，用 KOOK API 拉取最近 pageSize 条消息
   * 每条消息走 processImageMessage / processOcBrokenMessage（含去重）
   */
  async pullHistoryMessages(guildId: number, _pageSize = 50, startDate?: string, endDate?: string): Promise<{
    channels: number; messages: number; processed: number; skipped: number; errors: number; filtered: number; pages: number;
  }> {
    const guild = await this.guildRepo.findOne({ where: { id: guildId, status: GuildStatus.ACTIVE } });
    if (!guild) throw new Error('公会不存在或未激活');

    const channelIds = guild.kookListenChannelIds || [];
    if (channelIds.length === 0) throw new Error('未配置监听频道，请先在公会设置中选择频道');

    // 日期过滤（KOOK消息 create_at 为毫秒时间戳）
    const startTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
    const endTs = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Infinity;
    // 无日期限制时最多拉取 20 页（1000条），有日期限制时最多 40 页（2000条）
    const MAX_PAGES_PER_CHANNEL = (startDate || endDate) ? 40 : 20;
    const PAGE_SIZE = 50;

    this.logger.log(`[V2.9.5 pullHistory] 开始: ${channelIds.length}频道, 日期=${startDate || '无'}~${endDate || '无'}, 每频道最多${MAX_PAGES_PER_CHANNEL}页`);

    let totalMessages = 0, processed = 0, skipped = 0, errors = 0, filtered = 0, totalPages = 0;

    for (const channelId of channelIds) {
      let lastMsgId: string | undefined = undefined;
      let pageCount = 0;
      let hasMore = true;
      let reachedStartDate = false;

      while (hasMore && pageCount < MAX_PAGES_PER_CHANNEL) {
        try {
          // KOOK API: flag=before 表示获取 msg_id 之前的消息（从新到旧）
          const messages = await this.kookService.getChannelMessages(
            channelId, lastMsgId, lastMsgId ? 'before' : 'after', PAGE_SIZE,
          );
          pageCount++;
          totalPages++;

          if (messages.length === 0) { hasMore = false; break; }
          if (messages.length < PAGE_SIZE) hasMore = false;

          this.logger.log(`[V2.9.5] 频道 ${channelId} 第${pageCount}页: ${messages.length}条`);
          totalMessages += messages.length;

          // 更新游标为最旧的消息ID
          lastMsgId = messages[messages.length - 1]?.id;

          for (const msg of messages) {
            try {
              if (msg.author?.bot) { skipped++; continue; }

              // 日期过滤
              const msgTime = (msg as any).create_at || 0;
              if (msgTime > 0) {
                if (msgTime > endTs) { filtered++; continue; } // 太新，跳过
                if (msgTime < startTs) {
                  filtered++;
                  reachedStartDate = true; // 已超出开始日期，后续更旧的消息都不需要了
                  continue;
                }
              }

              const authorId = msg.author?.id || '';
              const authorName = msg.author?.nickname || msg.author?.username || authorId;

              const fakeD: any = {
                type: msg.type,
                content: msg.content,
                msg_id: msg.id,
                author_id: authorId,
                target_id: channelId,
                extra: {
                  guild_id: guild.kookGuildId,
                  author: msg.author,
                  attachments: msg.attachments || [],
                },
              };

              const imageUrls = this.extractAllImageUrls(fakeD);
              const textContent = typeof msg.content === 'string' ? msg.content : '';

              if (imageUrls.length > 0) {
                for (const imgUrl of imageUrls) {
                  await this.processImageMessage(guild, authorId, authorName, imgUrl, textContent, msg.id);
                }
                processed++;
              } else if (this.isOcBrokenMessage(textContent)) {
                await this.processOcBrokenMessage(guild, authorId, authorName, textContent, msg.id);
                processed++;
              } else {
                skipped++;
              }
            } catch (err) {
              errors++;
              this.logger.warn(`[V2.9.5] 消息处理失败 ${msg.id}: ${err}`);
            }
          }

          // 如果已经超出开始日期范围，不再翻页
          if (reachedStartDate) { hasMore = false; }
        } catch (err) {
          errors++;
          this.logger.warn(`[V2.9.5] 频道 ${channelId} 第${pageCount + 1}页拉取失败: ${err}`);
          hasMore = false;
        }
      }

      this.logger.log(`[V2.9.5] 频道 ${channelId} 完成: ${pageCount}页`);
    }

    this.logger.log(`[V2.9.5 pullHistory] 全部完成: ${channelIds.length}频道, ${totalPages}页, ${totalMessages}消息, 处理${processed}, 跳过${skipped}, 日期过滤${filtered}, 错误${errors}`);
    return { channels: channelIds.length, messages: totalMessages, processed, skipped, errors, filtered, pages: totalPages };
  }
}

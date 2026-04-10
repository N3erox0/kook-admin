import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { OcrService } from '../ocr/ocr.service';
import { ResupplyService } from '../resupply/resupply.service';
import { KookService } from './kook.service';

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
      author?: { id: string; username: string; nickname: string };
      attachments?: { type: string; url: string; name: string }[];
      guild_id?: string;
    };
    challenge?: string;
  };
}

/** 击杀详情解析结果 */
interface KillDetailParsed {
  date: string | null;       // YYYY-MM-DD
  mapName: string | null;    // 英文字母串
  gameId: string | null;     // 左侧游戏ID
  guildName: string | null;  // 公会名
  isKillDetail: boolean;     // 是否击杀详情图片
}

@Injectable()
export class KookMessageService {
  private readonly logger = new Logger(KookMessageService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    private kookService: KookService,
    private ocrService: OcrService,
    private resupplyService: ResupplyService,
  ) {}

  async handleWebhookEvent(payload: KookWebhookPayload): Promise<any> {
    if (payload.d?.challenge) {
      return { challenge: payload.d.challenge };
    }
    if (payload.s !== 0) return { ok: true };

    const d = payload.d;
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

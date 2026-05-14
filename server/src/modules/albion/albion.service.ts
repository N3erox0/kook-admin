import { Injectable, Logger } from '@nestjs/common';
import { CatalogService } from '../equipment-catalog/catalog.service';

export type AlbionServer = 'west' | 'east' | 'sgp' | 'ams' | string;

export interface AlbionGuildMemberDto {
  Id: string;
  Name: string;
  GuildId?: string;
  GuildName?: string;
  AllianceId?: string;
  AllianceName?: string;
  KillFame?: number;
  DeathFame?: number;
}

/**
 * 战报装备明细
 * @slot - 英文槽位名（MainHand/OffHand/Head/Armor/Shoes/Bag/Cape/Mount/Potion/Food）
 * @albionId - Albion 装备唯一ID（如 T8_SWORD@3）
 * @count - 数量
 * @itemQuality - 边框品质 0-5（0无/1普通/2良好/3优秀/4杰出/5不凡），仅展示保留
 * @catalogId - 匹配到的参考库ID，为null表示未匹配
 * @equipmentName - 装备名称（优先取参考库名称，否则用 albionId）
 * @level - 等级（T1-T8）
 * @enchantLevel - 附魔等级 @0~@4（来自 albionId @N 后缀或参考库 quality 字段）
 * @category - 部位（武器/副手/头/甲/鞋/披风/坐骑/药水/食物/其他），来自参考库
 * @gearScore - 装等（level + enchantLevel）
 * @matchStatus - 匹配状态（matched=已匹配参考库/unmatched=未匹配）
 */
export interface KillboardEquipmentItem {
  slot: string;
  albionId: string;
  count: number;
  itemQuality: number;
  catalogId: number | null;
  equipmentName: string;
  level: number | null;
  enchantLevel: number | null;
  category: string | null;
  gearScore: number | null;
  matchStatus: 'matched' | 'unmatched';
}

export interface KillboardMatchResult {
  matched: boolean;
  playerId?: string;
  event?: any;
  eventId?: number;
  battleId?: number;
  killTime?: string;
  location?: string;
  timeDiffMinutes?: number;
  items: KillboardEquipmentItem[];
  reason?: string;
}

@Injectable()
export class AlbionService {
  private readonly logger = new Logger(AlbionService.name);

  constructor(private readonly catalogService: CatalogService) {}

  getBaseUrl(server?: AlbionServer): string {
    const s = (server || 'sgp').toLowerCase();
    if (s === 'ams' || s === 'eu' || s === 'europe')
      return 'https://gameinfo-ams.albiononline.com/api/gameinfo';
    if (s === 'sgp' || s === 'asia' || s === 'east')
      return 'https://gameinfo-sgp.albiononline.com/api/gameinfo';
    return 'https://gameinfo.albiononline.com/api/gameinfo';
  }

  private async fetchJson<T = any>(
    server: AlbionServer | undefined,
    path: string,
  ): Promise<T> {
    const url = `${this.getBaseUrl(server)}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'kook-admin/1.0' },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok)
      throw new Error(`Albion API 请求失败 HTTP ${res.status}: ${url}`);
    return res.json() as Promise<T>;
  }

  async getGuildMembers(
    server: AlbionServer | undefined,
    albionGuildId: string,
  ): Promise<AlbionGuildMemberDto[]> {
    if (!albionGuildId) return [];
    const data = await this.fetchJson<AlbionGuildMemberDto[]>(
      server,
      `/guilds/${encodeURIComponent(albionGuildId)}/members`,
    );
    return Array.isArray(data) ? data : [];
  }

  async searchPlayer(
    server: AlbionServer | undefined,
    playerName: string,
  ): Promise<any | null> {
    if (!playerName) return null;

    // V2.12.3: 生成 OCR 混淆候选名（O↔0, l↔1↔I）
    const candidates = this.generateOcrCandidates(playerName);

    for (const name of candidates) {
      const data = await this.fetchJson<any>(
        server,
        `/search?q=${encodeURIComponent(name)}`,
      );
      const players = Array.isArray(data?.players) ? data.players : [];
      const exact = players.find(
        (p: any) =>
          String(p.Name || '').toLowerCase() === name.toLowerCase(),
      );
      if (exact) return exact;
      if (players.length > 0 && name === playerName) return players[0];
    }
    return null;
  }

  /** V2.12.3: 生成 OCR 混淆候选名（O↔0），最多 5 个候选 */
  private generateOcrCandidates(name: string): string[] {
    const candidates = [name];
    // O → 0
    if (/O/.test(name)) candidates.push(name.replace(/O/g, '0'));
    // 0 → O
    if (/0/.test(name)) candidates.push(name.replace(/0/g, 'O'));
    // 去重
    return [...new Set(candidates)].slice(0, 5);
  }

  async getPlayerDeaths(
    server: AlbionServer | undefined,
    playerId: string,
    limit = 10,
  ): Promise<any[]> {
    if (!playerId) return [];
    const data = await this.fetchJson<any>(
      server,
      `/players/${encodeURIComponent(playerId)}/deaths?limit=${limit}&offset=0`,
    );
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.Events)) return data.Events;
    return [];
  }

  async matchDeathEvent(params: {
    server?: AlbionServer;
    playerName: string;
    killTimeUtc?: string | null;
    mapName?: string | null;
    guildName?: string | null;
    maxMinutes?: number;
  }): Promise<KillboardMatchResult> {
    const player = await this.searchPlayer(params.server, params.playerName);
    if (!player?.Id) {
      return {
        matched: false,
        items: [],
        reason: `未找到 Albion 玩家: ${params.playerName}`,
      };
    }

    const deaths = await this.getPlayerDeaths(params.server, player.Id, 20);
    if (deaths.length === 0) {
      return {
        matched: false,
        playerId: player.Id,
        items: [],
        reason: '官网未返回死亡战报',
      };
    }

    const targetTime = params.killTimeUtc
      ? new Date(params.killTimeUtc).getTime()
      : NaN;
    const maxMinutes = params.maxMinutes ?? 5;
    const candidates = deaths
      .map((event) => {
        const eventTime = event.TimeStamp
          ? new Date(event.TimeStamp).getTime()
          : NaN;
        const diff =
          Number.isFinite(targetTime) && Number.isFinite(eventTime)
            ? Math.abs(eventTime - targetTime) / 60000
            : 0;
        let score = 0;
        if (!Number.isFinite(diff) || diff <= maxMinutes) score += 50;
        const location = String(event.Location || event.location || '');
        if (params.mapName && location) {
          if (location.toLowerCase() === params.mapName.toLowerCase())
            score += 20;
        } else if (!params.mapName || !location) score += 5;
        const victimGuild = String(event.Victim?.GuildName || '');
        if (params.guildName && victimGuild) {
          if (victimGuild.toLowerCase() === params.guildName.toLowerCase())
            score += 20;
        } else if (!params.guildName || !victimGuild) score += 5;
        return { event, diff, score };
      })
      .filter(
        (c) =>
          !Number.isFinite(c.diff) ||
          c.diff <= maxMinutes ||
          !params.killTimeUtc,
      )
      .sort((a, b) => b.score - a.score || a.diff - b.diff);

    const best = candidates[0];
    if (!best) {
      return {
        matched: false,
        playerId: player.Id,
        items: [],
        reason: `未匹配到 ±${maxMinutes} 分钟内死亡战报`,
      };
    }

    const items = await this.extractEquipmentItems(best.event);
    return {
      matched: true,
      playerId: player.Id,
      event: best.event,
      eventId: best.event.EventId,
      battleId: best.event.BattleId,
      killTime: best.event.TimeStamp,
      location: best.event.Location || null,
      timeDiffMinutes: Number.isFinite(best.diff)
        ? Math.round(best.diff * 100) / 100
        : undefined,
      items,
    };
  }

  async extractEquipmentItems(event: any): Promise<KillboardEquipmentItem[]> {
    const equipment = event?.Victim?.Equipment || {};
    const slots = [
      'MainHand',
      'OffHand',
      'Head',
      'Armor',
      'Shoes',
      'Bag',
      'Cape',
      'Mount',
      'Potion',
      'Food',
    ];
    const items: KillboardEquipmentItem[] = [];
    for (const slot of slots) {
      const raw = equipment[slot];
      if (!raw?.Type) continue;
      const albionId = String(raw.Type);
      const catalog = await this.catalogService
        .findByAlbionId(albionId)
        .catch((err) => {
          this.logger.warn(`findByAlbionId(${albionId}) 异常: ${err.message}`);
          return null;
        });
      const parsed = this.parseAlbionId(albionId);
      items.push({
        slot,
        albionId,
        count: Number(raw.Count || 1),
        itemQuality: Number(raw.Quality || 0),
        catalogId: catalog?.id || null,
        equipmentName: catalog?.name || albionId,
        level: catalog?.level || parsed.level,
        enchantLevel: catalog?.quality ?? parsed.enchantLevel,
        category: catalog?.category || null,
        gearScore:
          catalog?.gearScore ||
          (parsed.level ? parsed.level + parsed.enchantLevel : null),
        matchStatus: catalog ? 'matched' : 'unmatched',
      });
    }
    return items;
  }

  parseAlbionId(albionId: string): {
    level: number | null;
    enchantLevel: number;
  } {
    // 支持格式: T8_SWORD@3 / @3T8_SWORD / T8_SWORD_UI_SKIN@2 / @2T8_SWORD@3
    const atIndex = albionId.indexOf('@');
    let tier = 0;
    let enchant = 0;

    if (atIndex !== -1) {
      // 先找 @N 部分（从后往前找最后一个 @）
      const lastAt = albionId.lastIndexOf('@');
      const atPart = albionId.slice(lastAt + 1);
      enchant = parseInt(atPart, 10) || 0;
      // 取 @N 之前的部分来匹配 T数字
      const beforeAt = albionId.slice(0, lastAt);
      const tierMatch = beforeAt.match(/T(\d+)/i);
      tier = tierMatch ? parseInt(tierMatch[1], 10) : 0;
    } else {
      const tierMatch = albionId.match(/T(\d+)/i);
      tier = tierMatch ? parseInt(tierMatch[1], 10) : 0;
    }

    return {
      level: tier || null,
      enchantLevel: enchant,
    };
  }
}

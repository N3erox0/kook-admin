import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BattleReport } from './entities/battle-report.entity';
import { AlbionService, AlbionServer, KillboardEquipmentItem } from './albion.service';
import { Guild } from '../guild/entities/guild.entity';

/**
 * V3.2 战报拉取服务
 * - 增量分页：以本地最大 deathTime 为水位线，遇到旧事件停止
 * - 首次冷启动上限：每成员 200 条（4 页 × 51）
 * - INSERT IGNORE：依赖唯一索引 albion_event_id 去重，无 SELECT 预查
 * - 并发锁：同公会同时只允许一个拉取任务
 * - 重试：单成员失败重试 1 次（间隔 2s）
 * - 超时：单次任务总耗时上限 30 分钟
 */
@Injectable()
export class AlbionKillboardService {
  private readonly logger = new Logger(AlbionKillboardService.name);

  /** V3.2: 进程内并发锁（同公会同时只允许一个拉取任务） */
  private readonly runningGuilds = new Set<number>();

  /** V3.2: 单成员单次拉取分页上限（首次冷启动） */
  private readonly COLD_START_PAGE_LIMIT = 4; // 4 页 × 51 = 204 条
  private readonly PAGE_SIZE = 51; // Albion API 单次最大
  private readonly MEMBER_INTERVAL_MS = 500; // 成员间隔
  private readonly TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟

  constructor(
    @InjectRepository(BattleReport)
    private battleReportRepo: Repository<BattleReport>,
    @InjectRepository(Guild)
    private guildRepo: Repository<Guild>,
    private albionService: AlbionService,
  ) {}

  /** 当前是否有公会拉取任务在运行 */
  isRunning(guildId: number): boolean {
    return this.runningGuilds.has(guildId);
  }

  /**
   * 拉取公会所有成员的死亡记录（V3.2 增量分页版）
   * @param guildId 系统公会ID
   * @throws ConflictException 已有任务在运行
   */
  async pullGuildDeaths(
    guildId: number,
  ): Promise<{ pulled: number; newRecords: number; durationMs: number }> {
    if (this.runningGuilds.has(guildId)) {
      throw new ConflictException(`公会 ${guildId} 战报拉取任务已在运行，请稍后再试`);
    }

    const guild = await this.guildRepo.findOne({ where: { id: guildId } });
    if (!guild || !guild.albionGuildId) {
      this.logger.warn(`公会 ${guildId} 未配置 Albion Guild ID，跳过战报拉取`);
      return { pulled: 0, newRecords: 0, durationMs: 0 };
    }

    this.runningGuilds.add(guildId);
    const startTime = Date.now();
    let totalPulled = 0;
    let newRecords = 0;

    try {
      const server: AlbionServer = (guild as any).albionServer || 'sgp';

      // 1. 获取公会成员列表
      const members = await this.albionService.getGuildMembers(server, guild.albionGuildId);
      this.logger.log(
        `[${guild.name}] 共 ${members.length} 名成员，开始增量拉取战报...`,
      );

      // 2. 取本地各成员最大 deathTime 作为水位线（一次查询全公会）
      const watermarkMap = await this.loadWatermarkMap(guildId);

      // 3. 遍历成员
      for (const member of members) {
        // 任务超时检查
        if (Date.now() - startTime > this.TASK_TIMEOUT_MS) {
          this.logger.warn(
            `[${guild.name}] 任务超过 ${this.TASK_TIMEOUT_MS / 60000} 分钟，提前终止`,
          );
          break;
        }

        const memberResult = await this.pullMemberDeathsWithRetry(
          server,
          member,
          guildId,
          watermarkMap.get(member.Name) || null,
        );
        totalPulled += memberResult.pulled;
        newRecords += memberResult.inserted;

        // 成员间隔（避免 API 速率）
        await this.sleep(this.MEMBER_INTERVAL_MS);
      }
    } catch (err: any) {
      this.logger.error(`[公会 ${guildId}] 战报拉取异常: ${err.message}`);
    } finally {
      this.runningGuilds.delete(guildId);
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `公会 ${guildId} 战报拉取完成: 共拉取 ${totalPulled} 条, 新增 ${newRecords} 条, 耗时 ${(durationMs / 1000).toFixed(1)}s`,
    );
    return { pulled: totalPulled, newRecords, durationMs };
  }

  /** 单成员拉取（含重试 1 次） */
  private async pullMemberDeathsWithRetry(
    server: AlbionServer,
    member: { Id: string; Name: string },
    guildId: number,
    watermark: Date | null,
  ): Promise<{ pulled: number; inserted: number }> {
    try {
      return await this.pullMemberDeaths(server, member, guildId, watermark);
    } catch (err: any) {
      this.logger.warn(
        `[${member.Name}] 首次拉取失败: ${err.message}，2s后重试`,
      );
      await this.sleep(2000);
      try {
        return await this.pullMemberDeaths(server, member, guildId, watermark);
      } catch (err2: any) {
        this.logger.error(`[${member.Name}] 重试仍失败: ${err2.message}`);
        return { pulled: 0, inserted: 0 };
      }
    }
  }

  /** 单成员增量分页拉取核心逻辑 */
  private async pullMemberDeaths(
    server: AlbionServer,
    member: { Id: string; Name: string },
    guildId: number,
    watermark: Date | null,
  ): Promise<{ pulled: number; inserted: number }> {
    let pulled = 0;
    let inserted = 0;
    let offset = 0;
    let pageIdx = 0;
    const isColdStart = !watermark;
    const pageLimit = isColdStart ? this.COLD_START_PAGE_LIMIT : 99; // 增量模式不限页数（靠水位线兜底）

    while (pageIdx < pageLimit) {
      const events = await this.albionService.getPlayerDeathsPaged(
        server,
        member.Id,
        offset,
        this.PAGE_SIZE,
      );
      if (!events.length) break;

      pulled += events.length;
      let stopByWatermark = false;

      for (const event of events) {
        // 增量边界：事件比水位线旧 → 后续都旧（按时间倒序），停止
        if (
          watermark &&
          event.TimeStamp &&
          new Date(event.TimeStamp).getTime() <= watermark.getTime()
        ) {
          stopByWatermark = true;
          break;
        }

        const ok = await this.insertEvent(guildId, member.Name, event);
        if (ok) inserted++;
      }

      if (stopByWatermark) break;
      // 不足一页 → 已拉完
      if (events.length < this.PAGE_SIZE) break;

      offset += this.PAGE_SIZE;
      pageIdx++;
    }

    return { pulled, inserted };
  }

  /** 单事件入库（INSERT IGNORE 风格，依赖唯一索引去重） */
  private async insertEvent(
    guildId: number,
    memberName: string,
    event: any,
  ): Promise<boolean> {
    try {
      // 提取装备列表（含 catalog 反查）
      let items: KillboardEquipmentItem[] = [];
      try {
        items = await this.albionService.extractEquipmentItems(event);
      } catch {
        // 兜底：从原始 Equipment 取
        const victim = event.Victim || {};
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
        for (const slot of slots) {
          const item = (victim.Equipment || {})[slot];
          if (item && item.Type) {
            items.push({
              slot,
              albionId: item.Type,
              count: Number(item.Count || 1),
              itemQuality: Number(item.Quality || 0),
              equipmentName: item.Type,
              level: item.Tier || null,
              enchantLevel: item.EnchantmentLevel || 0,
              category: null,
              gearScore: null,
              catalogId: null,
              matchStatus: 'unmatched',
            });
          }
        }
      }

      // INSERT IGNORE 通过唯一索引 albion_event_id 去重
      // typeorm 的 .insert().orIgnore() 等价于 INSERT IGNORE
      const equipmentList = items.map((i) => ({
        slot: i.slot,
        albionId: i.albionId,
        name: i.equipmentName,
        level: i.level,
        enchantLevel: i.enchantLevel,
        quality: i.itemQuality,
        catalogId: i.catalogId,
        category: i.category,
        gearScore: i.gearScore,
        matchStatus: i.matchStatus,
      }));

      const result = await this.battleReportRepo
        .createQueryBuilder()
        .insert()
        .into(BattleReport)
        .values({
          guildId,
          memberName,
          albionPlayerId: event.Victim?.Id || null,
          albionEventId: event.EventId,
          battleId: event.BattleId || null,
          deathTime: new Date(event.TimeStamp),
          deathMap: event.Location || event.GameMapName || null,
          killerName: event.Killer?.Name || null,
          killerGuild: event.Killer?.GuildName || null,
          equipmentList,
          totalKillFame: event.TotalVictimKillFame || 0,
          rawEvent: event,
        } as any)
        .orIgnore()
        .execute();

      // affected 1 = 真插入，0 = 命中唯一键被忽略
      return (result.raw?.affectedRows ?? 0) > 0;
    } catch (err: any) {
      this.logger.warn(`事件 ${event?.EventId} 写入失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 取本公会所有成员的"本地最大 deathTime"映射（一次查询）
   */
  private async loadWatermarkMap(guildId: number): Promise<Map<string, Date>> {
    const rows = await this.battleReportRepo
      .createQueryBuilder('br')
      .select('br.memberName', 'memberName')
      .addSelect('MAX(br.deathTime)', 'maxDeathTime')
      .where('br.guildId = :guildId', { guildId })
      .groupBy('br.memberName')
      .getRawMany<{ memberName: string; maxDeathTime: string }>();

    const map = new Map<string, Date>();
    for (const r of rows) {
      if (r.maxDeathTime) map.set(r.memberName, new Date(r.maxDeathTime));
    }
    return map;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * 根据玩家名+时间范围匹配战报
   */
  async matchByPlayerAndTime(
    guildId: number,
    playerName: string,
    deathTime?: Date,
    mapName?: string,
  ): Promise<BattleReport | null> {
    const qb = this.battleReportRepo
      .createQueryBuilder('br')
      .where('br.guildId = :guildId', { guildId })
      .andWhere('br.memberName = :playerName', { playerName });

    if (deathTime) {
      const start = new Date(deathTime.getTime() - 2 * 60 * 60 * 1000);
      const end = new Date(deathTime.getTime() + 2 * 60 * 60 * 1000);
      qb.andWhere('br.deathTime BETWEEN :start AND :end', { start, end });
    }
    if (mapName) {
      qb.andWhere('br.deathMap LIKE :map', { map: `%${mapName}%` });
    }
    qb.orderBy('br.deathTime', 'DESC');
    return qb.getOne();
  }

  /**
   * 获取战报列表（前端展示）
   */
  async getReports(
    guildId: number,
    query: {
      page?: number;
      pageSize?: number;
      memberName?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;

    const qb = this.battleReportRepo
      .createQueryBuilder('br')
      .where('br.guildId = :guildId', { guildId });

    if (query.memberName) {
      qb.andWhere('br.memberName LIKE :name', {
        name: `%${query.memberName}%`,
      });
    }
    if (query.startDate) {
      qb.andWhere('br.deathTime >= :start', { start: query.startDate });
    }
    if (query.endDate) {
      qb.andWhere('br.deathTime <= :end', { end: query.endDate });
    }

    qb.orderBy('br.deathTime', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  /** 标记战报已匹配补装 */
  async markMatched(reportId: number): Promise<void> {
    await this.battleReportRepo.update(reportId, { matchedResupply: true });
  }
}

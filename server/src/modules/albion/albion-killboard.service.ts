import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BattleReport } from './entities/battle-report.entity';
import { AlbionService, AlbionServer } from './albion.service';
import { Guild } from '../guild/entities/guild.entity';

@Injectable()
export class AlbionKillboardService {
  private readonly logger = new Logger(AlbionKillboardService.name);

  constructor(
    @InjectRepository(BattleReport)
    private battleReportRepo: Repository<BattleReport>,
    @InjectRepository(Guild)
    private guildRepo: Repository<Guild>,
    private albionService: AlbionService,
  ) {}

  /**
   * 拉取公会所有成员的死亡记录并存入战报表
   * @param guildId 系统公会ID
   */
  async pullGuildDeaths(guildId: number): Promise<{ pulled: number; newRecords: number }> {
    const guild = await this.guildRepo.findOne({ where: { id: guildId } });
    if (!guild || !guild.albionGuildId) {
      this.logger.warn(`公会 ${guildId} 未配置 Albion Guild ID，跳过战报拉取`);
      return { pulled: 0, newRecords: 0 };
    }

    const server: AlbionServer = (guild as any).albionServer || 'sgp';
    let totalPulled = 0;
    let newRecords = 0;

    try {
      // 1. 获取公会成员列表
      const members = await this.albionService.getGuildMembers(server, guild.albionGuildId);
      this.logger.log(`公会 ${guild.name} 共 ${members.length} 名成员，开始拉取死亡记录...`);

      // 2. 遍历成员拉取死亡记录
      for (const member of members) {
        try {
          const deaths = await this.albionService.getPlayerDeaths(server, member.Id, 20);
          totalPulled += deaths.length;

          for (const event of deaths) {
            try {
              // 去重：检查 albionEventId 是否已存在
              const exists = await this.battleReportRepo.findOne({
                where: { albionEventId: event.EventId },
              });
              if (exists) continue;

              // 提取装备列表
              let items: any[] = [];
              try {
                items = await this.albionService.extractEquipmentItems(event);
              } catch {
                // 装备提取失败时直接从 Victim.Equipment 取原始数据
                const victim = event.Victim || {};
                const slots = ['MainHand','OffHand','Head','Armor','Shoes','Bag','Cape','Mount','Potion','Food'];
                for (const slot of slots) {
                  const item = (victim.Equipment || {})[slot];
                  if (item && item.Type) {
                    items.push({ slot, albionId: item.Type, equipmentName: item.Type, level: item.Tier || null, enchantLevel: item.EnchantmentLevel || 0, itemQuality: item.Quality || 0, catalogId: null });
                  }
                }
              }

              const report = this.battleReportRepo.create({
                guildId,
                memberName: member.Name,
                albionPlayerId: member.Id,
                albionEventId: event.EventId,
                battleId: event.BattleId || null,
                deathTime: new Date(event.TimeStamp),
                deathMap: event.Location || event.GameMapName || null,
                killerName: event.Killer?.Name || null,
                killerGuild: event.Killer?.GuildName || null,
                equipmentList: items.map(i => ({
                  slot: i.slot,
                  albionId: i.albionId,
                  name: i.equipmentName,
                  level: i.level,
                  enchantLevel: i.enchantLevel,
                  quality: i.itemQuality,
                  catalogId: i.catalogId,
                })),
                totalKillFame: event.TotalVictimKillFame || 0,
                rawEvent: event,
              });

              await this.battleReportRepo.save(report);
              newRecords++;
            } catch (eventErr) {
              this.logger.warn(`  事件 ${event.EventId} 写入失败: ${eventErr.message}`);
            }
          }

          // 避免 API 速率限制，每个成员间隔 500ms
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          this.logger.warn(`拉取成员 ${member.Name} 死亡记录失败: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`拉取公会 ${guildId} 战报失败: ${err.message}`);
    }

    this.logger.log(`公会 ${guildId} 战报拉取完成: 共拉取 ${totalPulled} 条, 新增 ${newRecords} 条`);
    return { pulled: totalPulled, newRecords };
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
    const qb = this.battleReportRepo.createQueryBuilder('br')
      .where('br.guildId = :guildId', { guildId })
      .andWhere('br.memberName = :playerName', { playerName });

    if (deathTime) {
      // 时间容差：前后 2 小时
      const start = new Date(deathTime.getTime() - 2 * 60 * 60 * 1000);
      const end = new Date(deathTime.getTime() + 2 * 60 * 60 * 1000);
      qb.andWhere('br.deathTime BETWEEN :start AND :end', { start, end });
    }

    if (mapName) {
      qb.andWhere('br.deathMap LIKE :map', { map: `%${mapName}%` });
    }

    // 按时间倒序取最近一条
    qb.orderBy('br.deathTime', 'DESC');
    return qb.getOne();
  }

  /**
   * 获取战报列表（前端展示）
   */
  async getReports(guildId: number, query: {
    page?: number;
    pageSize?: number;
    memberName?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;

    const qb = this.battleReportRepo.createQueryBuilder('br')
      .where('br.guildId = :guildId', { guildId });

    if (query.memberName) {
      qb.andWhere('br.memberName LIKE :name', { name: `%${query.memberName}%` });
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

  /**
   * 标记战报已匹配补装
   */
  async markMatched(reportId: number): Promise<void> {
    await this.battleReportRepo.update(reportId, { matchedResupply: true });
  }
}

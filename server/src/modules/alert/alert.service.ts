import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuildAlertRule } from './entities/guild-alert-rule.entity';
import { GuildAlertRecord } from './entities/guild-alert-record.entity';
import { GuildInventory } from '../equipment/entities/guild-inventory.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { GuildResupply } from '../resupply/entities/guild-resupply.entity';
import { CreateAlertRuleDto, UpdateAlertRuleDto, QueryAlertRecordDto } from './dto/alert.dto';
import { AlertRuleType } from '../../common/constants/enums';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    @InjectRepository(GuildAlertRule) private ruleRepo: Repository<GuildAlertRule>,
    @InjectRepository(GuildAlertRecord) private recordRepo: Repository<GuildAlertRecord>,
    @InjectRepository(GuildInventory) private invRepo: Repository<GuildInventory>,
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    @InjectRepository(GuildResupply) private resupplyRepo: Repository<GuildResupply>,
  ) {}

  // ===== 规则 CRUD =====

  async findAllRules(guildId: number) {
    return this.ruleRepo.find({ where: { guildId }, order: { ruleType: 'ASC', createdAt: 'DESC' } });
  }

  async createRule(guildId: number, dto: CreateAlertRuleDto, userId: number) {
    // 解析装等值 → gearScoreMin/Max
    const parsed = this.parseGearScoreValue(dto.gearScoreValue);
    return this.ruleRepo.save(this.ruleRepo.create({
      ...dto,
      guildId,
      createdBy: userId,
      gearScoreMin: dto.gearScoreMin ?? parsed.min,
      gearScoreMax: dto.gearScoreMax ?? parsed.max,
    }));
  }

  async updateRule(guildId: number, id: number, dto: UpdateAlertRuleDto) {
    const rule = await this.ruleRepo.findOne({ where: { id, guildId } });
    if (!rule) throw new NotFoundException('规则不存在');
    if (dto.gearScoreValue) {
      const parsed = this.parseGearScoreValue(dto.gearScoreValue);
      dto.gearScoreMin = dto.gearScoreMin ?? parsed.min;
      dto.gearScoreMax = dto.gearScoreMax ?? parsed.max;
    }
    Object.assign(rule, dto);
    return this.ruleRepo.save(rule);
  }

  async removeRule(guildId: number, id: number) {
    await this.ruleRepo.delete({ id, guildId });
    return { id };
  }

  // ===== 记录查询 =====

  async findAllRecords(guildId: number, query: QueryAlertRecordDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.recordRepo.createQueryBuilder('r').where('r.guildId = :guildId', { guildId });
    if (query.isResolved !== undefined) qb.andWhere('r.isResolved = :ir', { ir: query.isResolved });
    if (query.alertType) qb.andWhere('r.alertType = :at', { at: query.alertType });
    qb.orderBy('r.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async resolveRecord(guildId: number, id: number) {
    const r = await this.recordRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('记录不存在');
    r.isResolved = 1;
    r.resolvedAt = new Date();
    return this.recordRepo.save(r);
  }

  // ===== 01 补装库存预警扫描（每天05:00） =====

  async scanInventoryAlerts(guildId: number): Promise<GuildAlertRecord[]> {
    const rules = await this.ruleRepo.find({
      where: { guildId, enabled: 1, ruleType: AlertRuleType.INVENTORY_ALERT },
    });
    const alerts: GuildAlertRecord[] = [];

    for (const rule of rules) {
      // 按 装等+装备名称 合并计算数量
      const qb = this.invRepo.createQueryBuilder('inv')
        .leftJoin('inv.catalog', 'cat')
        .select('SUM(inv.quantity)', 'total')
        .where('inv.guildId = :guildId', { guildId });

      if (rule.equipmentName) qb.andWhere('cat.name LIKE :n', { n: `%${rule.equipmentName}%` });
      if (rule.gearScoreMin != null) qb.andWhere('cat.gearScore >= :gsMin', { gsMin: rule.gearScoreMin });
      if (rule.gearScoreMax != null) qb.andWhere('cat.gearScore <= :gsMax', { gsMax: rule.gearScoreMax });

      const result = await qb.getRawOne();
      const currentValue = parseInt(result?.total || '0');

      if (currentValue < rule.threshold) {
        const gs = rule.gearScoreValue || `P${rule.gearScoreMin || '?'}`;
        const name = rule.equipmentName || '全部';
        const record = this.recordRepo.create({
          guildId,
          ruleId: rule.id,
          alertType: 'inventory',
          message: `${gs}${name} 数量＜${rule.threshold}（当前${currentValue}）`,
          currentValue,
          thresholdValue: rule.threshold,
        });
        alerts.push(await this.recordRepo.save(record));
      }
    }

    this.logger.log(`[公会${guildId}] 库存预警扫描完成, 触发 ${alerts.length} 条`);
    return alerts;
  }

  // ===== 02 死亡次数预警（每天06:00） =====

  async scanDeathCountAlerts(guildId: number): Promise<GuildAlertRecord[]> {
    const rules = await this.ruleRepo.find({
      where: { guildId, enabled: 1, ruleType: AlertRuleType.DEATH_COUNT_ALERT },
    });
    if (rules.length === 0) return [];

    const alerts: GuildAlertRecord[] = [];
    const today = new Date().toISOString().slice(0, 10);

    // 按成员名+日期统计补装次数（status=1已通过 或 status=3已发放，统计当天数据）
    const stats = await this.resupplyRepo.createQueryBuilder('r')
      .select('r.kookNickname', 'memberName')
      .addSelect('r.kookUserId', 'kookUserId')
      .addSelect('COUNT(*)', 'deathCount')
      .addSelect('GROUP_CONCAT(DISTINCT cat.gearScore)', 'gearScores')
      .leftJoin(EquipmentCatalog, 'cat', 'cat.name = r.equipmentName')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.status IN (1, 3)')
      .andWhere('DATE(r.createdAt) = :today', { today })
      .groupBy('r.kookUserId')
      .addGroupBy('r.kookNickname')
      .getRawMany();

    for (const stat of stats) {
      for (const rule of rules) {
        // 按装等匹配
        let matchGearScore = true;
        if (rule.gearScoreMin != null || rule.gearScoreMax != null) {
          const gs = (stat.gearScores || '').split(',').map(Number).filter(Boolean);
          if (rule.gearScoreMin != null) matchGearScore = gs.some((g: number) => g >= rule.gearScoreMin);
          if (rule.gearScoreMax != null && matchGearScore) matchGearScore = gs.some((g: number) => g <= rule.gearScoreMax);
        }

        if (matchGearScore && parseInt(stat.deathCount) >= rule.threshold) {
          const gs = rule.gearScoreValue || `P${rule.gearScoreMin || '?'}`;
          const record = this.recordRepo.create({
            guildId,
            ruleId: rule.id,
            alertType: 'death_count',
            message: `${stat.memberName} 今日${gs}死亡补装 ${stat.deathCount} 次 ≥ 阈值${rule.threshold}`,
            currentValue: parseInt(stat.deathCount),
            thresholdValue: rule.threshold,
          });
          alerts.push(await this.recordRepo.save(record));
        }
      }
    }

    this.logger.log(`[公会${guildId}] 死亡次数预警扫描完成, 触发 ${alerts.length} 条`);
    return alerts;
  }

  // ===== 通用扫描（兼容旧代码） =====

  async scanAndCreateAlerts(guildId: number): Promise<GuildAlertRecord[]> {
    const inventoryAlerts = await this.scanInventoryAlerts(guildId);
    return inventoryAlerts;
  }

  // ===== 已统计标记 =====

  async markInventoryAsCounted(guildId: number) {
    await this.invRepo.createQueryBuilder()
      .update(GuildInventory)
      .set({ isCounted: 1 })
      .where('guildId = :guildId AND isCounted = 0', { guildId })
      .execute();
  }

  async markResupplyAsCounted(guildId: number) {
    await this.resupplyRepo.createQueryBuilder()
      .update(GuildResupply)
      .set({ isCounted: 1 })
      .where('guildId = :guildId AND isCounted = 0 AND status IN (1, 3)', { guildId })
      .execute();
  }

  // ===== 辅助 =====

  /** 解析装等值字符串 → min/max，如 "P4-P8" → {min:4, max:8}，"P9" → {min:9, max:9} */
  private parseGearScoreValue(value?: string): { min: number | null; max: number | null } {
    if (!value) return { min: null, max: null };
    const cleaned = value.replace(/[Pp]/g, '');
    if (cleaned.includes('-')) {
      const [a, b] = cleaned.split('-').map(Number);
      return { min: a || null, max: b || null };
    }
    const num = parseInt(cleaned);
    return isNaN(num) ? { min: null, max: null } : { min: num, max: num };
  }
}

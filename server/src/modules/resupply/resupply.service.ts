import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuildResupply } from './entities/guild-resupply.entity';
import { GuildResupplyLog } from './entities/guild-resupply-log.entity';
import { EquipmentService } from '../equipment/equipment.service';
import { CatalogService } from '../equipment-catalog/catalog.service';
import { KookNotifyService } from '../kook/kook-notify.service';
import { CreateResupplyDto, ProcessResupplyDto, UpdateResupplyFieldsDto, BatchProcessDto, BatchAssignRoomDto, QueryResupplyDto } from './dto/resupply.dto';
import { ResupplyStatus } from '../../common/constants/enums';
import * as crypto from 'crypto';

/** 从 KOOK 昵称中提取箱子编号
 * 格式：房间号-箱子号，如 "玩家A 3-16" → "3-16", "大厅 32" → "大厅32"
 * 支持: 1-14,12-14, 大厅1, 大厅32, 大厅63
 */
function parseResupplyBox(nickname: string): string | null {
  if (!nickname) return null;
  // 匹配 "大厅" + 数字
  const hallMatch = nickname.match(/大厅\s*(\d{1,2})/);
  if (hallMatch) return `大厅${hallMatch[1]}`;
  // 匹配 数字-数字（房间-箱子）
  const roomBoxMatch = nickname.match(/(\d{1,2})-(\d{1,2})/);
  if (roomBoxMatch) {
    const room = parseInt(roomBoxMatch[1]);
    const box = parseInt(roomBoxMatch[2]);
    if (room >= 1 && room <= 14 && box >= 1 && box <= 64) {
      return `${room}-${box}`;
    }
  }
  return null;
}

@Injectable()
export class ResupplyService {
  private readonly logger = new Logger(ResupplyService.name);

  constructor(
    @InjectRepository(GuildResupply) private resupplyRepo: Repository<GuildResupply>,
    @InjectRepository(GuildResupplyLog) private logRepo: Repository<GuildResupplyLog>,
    private equipmentService: EquipmentService,
    private catalogService: CatalogService,
    private kookNotifyService: KookNotifyService,
  ) {}

  async findAll(guildId: number, query: QueryResupplyDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId });

    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status });
    if (query.keyword) {
      // 支持 P8+堕神 格式：拆分装等+装备名
      const gearScoreMatch = query.keyword.match(/^P(\d+)\s*[+＋]?\s*(.+)/i);
      if (gearScoreMatch) {
        const gs = parseInt(gearScoreMatch[1]);
        const name = gearScoreMatch[2].trim();
        qb.andWhere('r.gearScore = :gs', { gs });
        qb.andWhere('(r.equipmentName LIKE :kw OR r.kookNickname LIKE :kw)', { kw: `%${name}%` });
      } else {
        qb.andWhere('(r.equipmentName LIKE :kw OR r.kookNickname LIKE :kw)', { kw: `%${query.keyword}%` });
      }
    }
    if (query.applyType) qb.andWhere('r.applyType = :at', { at: query.applyType });
    if (query.room) qb.andWhere('r.resupplyRoom = :room', { room: query.room });
    if (query.startDate && query.endDate) {
      qb.andWhere('r.createdAt BETWEEN :startDate AND :endDate', {
        startDate: `${query.startDate} 00:00:00`,
        endDate: `${query.endDate} 23:59:59`,
      });
    } else if (query.startDate) {
      qb.andWhere('r.createdAt >= :startDate', { startDate: `${query.startDate} 00:00:00` });
    } else if (query.endDate) {
      qb.andWhere('r.createdAt <= :endDate', { endDate: `${query.endDate} 23:59:59` });
    }

    qb.orderBy('r.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findOne(guildId: number, id: number) {
    const r = await this.resupplyRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('补装申请不存在');
    const logs = await this.logRepo.find({ where: { resupplyId: id }, order: { createdAt: 'ASC' } });
    return { ...r, logs };
  }

  /** 生成去重哈希：图片URL + 日期 + 人员 */
  generateDedupHash(screenshotUrl: string, date: string, kookUserId: string): string {
    const raw = `${screenshotUrl}|${date}|${kookUserId}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  /** 创建补装申请（含去重检查） */
  async create(guildId: number, dto: CreateResupplyDto) {
    // 去重检查
    if (dto.screenshotUrl && dto.kookUserId) {
      const dateStr = dto.killDate || new Date().toISOString().slice(0, 10);
      const hash = this.generateDedupHash(dto.screenshotUrl, dateStr, dto.kookUserId);

      const existing = await this.resupplyRepo.findOne({
        where: { guildId, dedupHash: hash },
      });
      if (existing) {
        this.logger.warn(`补装去重命中: hash=${hash}, 已有申请ID=${existing.id}`);
        return { deduplicated: true, existingId: existing.id, message: '该补装申请已存在（去重）' };
      }

      dto['_dedupHash'] = hash;
    }

    const r = this.resupplyRepo.create({
      ...dto,
      guildId,
      resupplyBox: dto.resupplyBox || parseResupplyBox(dto.kookNickname) || null,
      status: ResupplyStatus.PENDING,
      dedupHash: dto['_dedupHash'] || null,
    });
    const saved = await this.resupplyRepo.save(r);
    await this.addLog(guildId, saved.id, 'create', null, 'pending', null, null, '创建补装申请');
    return saved;
  }

  /** 从击杀详情创建多条补装申请 */
  async createFromKillDetail(guildId: number, data: {
    kookUserId: string;
    kookNickname: string;
    screenshotUrl: string;
    killDate: string;
    mapName: string;
    gameId: string;
    guild: string;
    equipments: { name: string; level?: number; quality?: number; gearScore?: number; category?: string; catalogId?: number }[];
    kookMessageId?: string;
  }): Promise<{ created: number; skipped: number; details: any[] }> {
    let created = 0, skipped = 0;
    const details: any[] = [];

    for (let i = 0; i < data.equipments.length; i++) {
      const eq = data.equipments[i];
      const dateStr = data.killDate || new Date().toISOString().slice(0, 10);
      const hash = this.generateDedupHash(
        `${data.screenshotUrl}_${eq.name}_${i}`,
        dateStr,
        data.kookUserId,
      );

      // 去重检查
      const existing = await this.resupplyRepo.findOne({ where: { guildId, dedupHash: hash } });
      if (existing) {
        skipped++;
        details.push({ name: eq.name, status: 'skipped', reason: '去重' });
        continue;
      }

      const r = this.resupplyRepo.create({
        guildId,
        kookUserId: data.kookUserId,
        kookNickname: data.kookNickname,
        equipmentName: eq.name,
        level: eq.level,
        quality: eq.quality,
        gearScore: eq.gearScore,
        category: eq.category,
        quantity: 1,
        applyType: '补装',
        reason: `击杀详情 | 日期:${data.killDate} | 地图:${data.mapName} | 游戏ID:${data.gameId}`,
        screenshotUrl: data.screenshotUrl,
        kookMessageId: data.kookMessageId ? `${data.kookMessageId}_${i}` : null,
        dedupHash: hash,
        resupplyBox: parseResupplyBox(data.kookNickname) || null,
        status: ResupplyStatus.PENDING,
      });
      await this.resupplyRepo.save(r);
      await this.addLog(guildId, r.id, 'create', null, 'pending', null, null, `击杀详情自动创建`);
      created++;
      details.push({ name: eq.name, status: 'created', id: r.id });
    }

    this.logger.log(`[公会${guildId}] 击杀详情补装: 创建${created}, 跳过${skipped}`);
    return { created, skipped, details };
  }

  async updateFields(guildId: number, id: number, dto: UpdateResupplyFieldsDto) {
    const r = await this.resupplyRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('补装申请不存在');
    Object.assign(r, dto);
    return this.resupplyRepo.save(r);
  }

  async process(guildId: number, id: number, dto: ProcessResupplyDto, operatorId: number, operatorName: string) {
    const r = await this.resupplyRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('补装申请不存在');

    const fromStatus = String(r.status);

    switch (dto.action) {
      case 'approve': {
        if (r.status !== ResupplyStatus.PENDING) throw new BadRequestException('当前状态不允许通过');
        r.status = ResupplyStatus.APPROVED;
        r.processedBy = operatorId;
        r.processRemark = dto.remark || null;
        r.processedAt = new Date();

        // 通过后立即扣减库存-1（优先精确匹配 catalogId）
        try {
          let catalogId: number | null = null;

          // 优先使用补装申请的 gearScore+equipmentName 精确匹配
          if (r.equipmentName) {
            const matches = await this.catalogService.findByNameFuzzy(r.equipmentName, 0.8);
            if (matches.length > 0) {
              // 如果有多个匹配项，优先选择 level/quality/gearScore 完全匹配的
              const exactMatch = matches.find(m =>
                (!r.level || m.item.level === r.level) &&
                (!r.quality && r.quality !== 0 || m.item.quality === r.quality) &&
                (!r.gearScore || m.item.gearScore === r.gearScore)
              );
              catalogId = exactMatch ? exactMatch.item.id : matches[0].item.id;
            }
          }

          if (catalogId) {
            await this.equipmentService.deductForDispatch(guildId, catalogId, 1, operatorId, operatorName);
            this.logger.log(`补装通过扣减库存: ${r.equipmentName} -1 (catalogId=${catalogId})`);
          } else {
            this.logger.warn(`补装通过但未找到匹配装备: ${r.equipmentName}`);
          }
        } catch (err: any) {
          this.logger.error(`补装扣减库存失败: ${err.message}`);
        }
        break;
      }
      case 'reject': {
        if (r.status !== ResupplyStatus.PENDING) throw new BadRequestException('当前状态不允许驳回');
        if (!dto.remark) throw new BadRequestException('驳回必须填写原因');
        r.status = ResupplyStatus.REJECTED;
        r.processedBy = operatorId;
        r.processRemark = dto.remark;
        r.processedAt = new Date();
        break;
      }
      case 'dispatch': {
        if (r.status !== ResupplyStatus.APPROVED) throw new BadRequestException('只有已通过的申请才能标记已发放');
        r.status = ResupplyStatus.DISPATCHED;
        r.dispatchedBy = operatorId;
        r.dispatchedAt = new Date();
        r.dispatchQuantity = dto.dispatchQuantity || r.quantity;
        break;
      }
      default:
        throw new BadRequestException('无效操作');
    }

    await this.resupplyRepo.save(r);
    await this.addLog(guildId, id, dto.action, fromStatus, String(r.status), operatorId, operatorName, dto.remark);

    // KOOK 通知（异步）
    try {
      if (dto.action === 'reject' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyRejected(r.kookUserId, r.equipmentName, r.quantity, dto.remark || '');
      } else if (dto.action === 'approve' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyApproved(r.kookUserId, r.equipmentName, r.quantity);
      } else if (dto.action === 'dispatch' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyDispatched(r.kookUserId, r.equipmentName, r.dispatchQuantity || r.quantity);
      }
      this.kookNotifyService.notifyResupplyStatusChange(
        r.kookNickname || '未知', r.equipmentName, r.quantity, r.status, dto.remark,
      );
    } catch (err) {
      this.logger.error(`KOOK 通知发送失败: ${err}`);
    }

    return { id, status: r.status };
  }

  async batchProcess(guildId: number, dto: BatchProcessDto, operatorId: number, operatorName: string) {
    const results: any[] = [];
    for (const id of dto.ids) {
      try {
        const result = await this.process(guildId, id, { action: dto.action, remark: dto.remark }, operatorId, operatorName);
        results.push(result);
      } catch (err: any) {
        results.push({ id, error: err.message });
      }
    }
    return { processed: results.length, results };
  }

  /** 获取今日已通过但未回应表情的补装 */
  async getApprovedUnreacted(guildId: number): Promise<GuildResupply[]> {
    return this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.status = :status', { status: ResupplyStatus.APPROVED })
      .andWhere('r.kookMessageId IS NOT NULL')
      .andWhere('r.isCounted = 0')
      .getMany();
  }

  /** 标记为已回应 */
  async markAsCounted(ids: number[]) {
    if (ids.length === 0) return;
    await this.resupplyRepo.createQueryBuilder()
      .update(GuildResupply)
      .set({ isCounted: 1 })
      .where('id IN (:...ids)', { ids })
      .execute();
  }

  /** 批量分配补装房间 */
  async batchAssignRoom(guildId: number, dto: BatchAssignRoomDto) {
    if (dto.ids.length === 0) return { updated: 0 };
    await this.resupplyRepo.createQueryBuilder()
      .update(GuildResupply)
      .set({ resupplyRoom: dto.room })
      .where('id IN (:...ids)', { ids: dto.ids })
      .andWhere('guildId = :guildId', { guildId })
      .execute();
    return { updated: dto.ids.length, room: dto.room };
  }

  /** 获取待处理记录按装备聚合排序（临时排序视图）
   * 支持关键词过滤（如 P8+堕神）
   */
  async getGroupedByEquipment(guildId: number, keyword?: string): Promise<GuildResupply[]> {
    const qb = this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.status = :s', { s: ResupplyStatus.PENDING });

    if (keyword) {
      const gearScoreMatch = keyword.match(/^P(\d+)\s*[+＋]?\s*(.+)/i);
      if (gearScoreMatch) {
        const gs = parseInt(gearScoreMatch[1]);
        const name = gearScoreMatch[2].trim();
        qb.andWhere('r.gearScore = :gs', { gs });
        qb.andWhere('r.equipmentName LIKE :kw', { kw: `%${name}%` });
      } else {
        qb.andWhere('r.equipmentName LIKE :kw', { kw: `%${keyword}%` });
      }
    }

    // 按装备名聚合排序：相同装备名排在一起，组内按时间排序
    qb.orderBy('r.equipmentName', 'ASC')
      .addOrderBy('r.gearScore', 'DESC')
      .addOrderBy('r.createdAt', 'ASC');

    return qb.getMany();
  }

  private async addLog(guildId: number, resupplyId: number, action: string, from: string | null, to: string, operatorId?: number, operatorName?: string, remark?: string) {
    await this.logRepo.save(this.logRepo.create({
      guildId, resupplyId, action, fromStatus: from, toStatus: to, operatorId, operatorName, remark,
    }));
  }
}

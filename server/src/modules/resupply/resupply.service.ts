import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { GuildResupply } from './entities/guild-resupply.entity';
import { GuildResupplyLog } from './entities/guild-resupply-log.entity';
import { EquipmentService } from '../equipment/equipment.service';
import { KookNotifyService } from '../kook/kook-notify.service';
import { CatalogService } from '../equipment-catalog/catalog.service';
import { ImageMatchService } from '../ocr/image-match.service';
import { CreateResupplyDto, ProcessResupplyDto, UpdateResupplyFieldsDto, BatchProcessDto, BatchAssignRoomDto, QueryResupplyDto, QuickCompleteResupplyDto, BatchRejectDto } from './dto/resupply.dto';
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
    private kookNotifyService: KookNotifyService,
    private catalogService: CatalogService,
    private imageMatchService: ImageMatchService,
    private configService: ConfigService,
  ) {}

  async findAll(guildId: number, query: QueryResupplyDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId });

    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status });
    if (query.keyword) {
      qb.andWhere('(r.equipmentIds LIKE :kw OR r.kookNickname LIKE :kw)', { kw: `%${query.keyword}%` });
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

    // 解析 equipmentIds → 装备名称
    const enrichedList = await this.enrichEquipmentNames(list);
    return { list: enrichedList, total, page, pageSize };
  }

  /** 部位排序权重：武器→副手→头→甲→鞋→其他 */
  private static readonly CATEGORY_ORDER: Record<string, number> = {
    '武器': 1, '副手': 2, '头': 3, '甲': 4, '鞋': 5,
    '披风': 6, '坐骑': 7, '药水': 8, '食物': 9, '其他': 10,
  };

  /** 将补装记录中的 equipmentIds (逗号分隔catalog ID) 解析为装备名称 */
  private async enrichEquipmentNames(items: GuildResupply[]): Promise<any[]> {
    const allIds = new Set<number>();
    for (const item of items) {
      if (item.equipmentIds) {
        item.equipmentIds.split(',').filter(Boolean).map(Number).forEach(id => { if (!isNaN(id)) allIds.add(id); });
      }
    }
    if (allIds.size === 0) return items;

    // 批量查询 catalog 名称
    const catalogMap = new Map<number, { name: string; level: number; quality: number; gearScore: number; category: string }>();
    for (const id of allIds) {
      try {
        const cat = await this.catalogService.findById(id);
        if (cat) catalogMap.set(id, { name: cat.name, level: cat.level, quality: cat.quality, gearScore: cat.gearScore, category: cat.category });
      } catch {}
    }

    return items.map(item => {
      const ids = (item.equipmentIds || '').split(',').filter(Boolean).map(Number);
      const details = ids.map(id => catalogMap.get(id) || null).filter(Boolean) as { name: string; level: number; quality: number; gearScore: number; category: string }[];
      // 按部位排序：武器→副手→头→甲→鞋→其他
      details.sort((a, b) => (ResupplyService.CATEGORY_ORDER[a.category] || 10) - (ResupplyService.CATEGORY_ORDER[b.category] || 10));
      // 格式：P{装等} {名称}
      const names = details.map(cat => `P${cat.gearScore} ${cat.name}`);
      return { ...item, equipmentNames: names.join('、'), equipmentDetails: details };
    });
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

  /** 根据去重哈希查找已有补装申请 */
  async findByDedupHash(guildId: number, dedupHash: string): Promise<GuildResupply | null> {
    return this.resupplyRepo.findOne({ where: { guildId, dedupHash } });
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

    // F-103: 支持 equipmentEntries（含数量）— 展开成多份 catalogId 的 equipmentIds
    let equipmentIds = dto.equipmentIds || '';
    let qty = dto.quantity || 0;
    if (dto.equipmentEntries && dto.equipmentEntries.length > 0) {
      const expandedIds: number[] = [];
      for (const entry of dto.equipmentEntries) {
        const times = Math.max(1, entry.quantity || 1);
        for (let i = 0; i < times; i++) expandedIds.push(entry.catalogId);
      }
      equipmentIds = expandedIds.join(',');
      qty = expandedIds.length;
    } else {
      // 兼容旧路径：从 equipmentIds 字符串解析
      const ids = equipmentIds.split(',').filter(Boolean);
      qty = qty || ids.length;
    }

    const r = this.resupplyRepo.create({
      guildId,
      guildMemberId: dto.guildMemberId,
      kookUserId: dto.kookUserId,
      kookNickname: dto.kookNickname,
      equipmentIds,
      quantity: qty,
      applyType: dto.applyType || '手动创建',
      reason: dto.reason,
      screenshotUrl: dto.screenshotUrl,
      kookMessageId: dto.kookMessageId,
      killDate: dto.killDate,
      mapName: dto.mapName,
      gameId: dto.gameId,
      resupplyBox: dto.resupplyBox || parseResupplyBox(dto.kookNickname) || null,
      status: ResupplyStatus.PENDING,
      dedupHash: dto['_dedupHash'] || null,
    });
    const saved = await this.resupplyRepo.save(r);
    await this.addLog(guildId, saved.id, 'create', null, 'pending', null, null, '创建补装申请');
    return saved;
  }

  /** 从击杀详情创建一条补装申请（一次死亡=一条记录=多件装备ID） */
  async createFromKillDetail(guildId: number, data: {
    kookUserId: string;
    kookNickname: string;
    screenshotUrl: string;
    killDate: string;
    mapName: string;
    gameId: string;
    guild: string;
    equipmentCatalogIds: number[]; // catalog ID 数组
    kookMessageId?: string;
  }): Promise<{ created: boolean; skipped: boolean; resupplyId?: number }> {
    const dateStr = data.killDate || new Date().toISOString().slice(0, 10);
    const hash = this.generateDedupHash(data.screenshotUrl, dateStr, data.kookUserId);

    // 去重检查
    const existing = await this.resupplyRepo.findOne({ where: { guildId, dedupHash: hash } });
    if (existing) {
      this.logger.warn(`补装去重命中: hash=${hash}, 已有申请ID=${existing.id}`);
      return { created: false, skipped: true };
    }

    const equipmentIds = data.equipmentCatalogIds.join(',');
    const r = this.resupplyRepo.create({
      guildId,
      kookUserId: data.kookUserId,
      kookNickname: data.kookNickname,
      equipmentIds,
      quantity: data.equipmentCatalogIds.length,
      applyType: '死亡补装',
      reason: `击杀详情 | 日期:${data.killDate} | 地图:${data.mapName} | 游戏ID:${data.gameId}`,
      screenshotUrl: data.screenshotUrl,
      kookMessageId: data.kookMessageId || null,
      dedupHash: hash,
      resupplyBox: parseResupplyBox(data.kookNickname) || null,
      killDate: data.killDate || null,
      mapName: data.mapName || null,
      gameId: data.gameId || null,
      ocrGuildName: data.guild || null,
      status: ResupplyStatus.PENDING,
    });
    const saved = await this.resupplyRepo.save(r);
    await this.addLog(guildId, saved.id, 'create', null, 'pending', null, null, '击杀详情自动创建');

    this.logger.log(`[公会${guildId}] 击杀详情补装: 创建1条, ${data.equipmentCatalogIds.length}件装备`);
    return { created: true, skipped: false, resupplyId: saved.id };
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

        // 逐个 equipment_ids 中的 catalogId 各扣减库存 1
        try {
          const ids = (r.equipmentIds || '').split(',').filter(Boolean).map(Number);
          let deducted = 0;
          for (const catalogId of ids) {
            if (!catalogId || isNaN(catalogId)) continue;
            try {
              await this.equipmentService.deductForDispatch(guildId, catalogId, 1, operatorId, operatorName);
              deducted++;
            } catch (err: any) {
              this.logger.warn(`补装扣减库存失败 catalogId=${catalogId}: ${err.message}`);
            }
          }
          this.logger.log(`补装通过扣减库存: ${deducted}/${ids.length} 件 (申请ID=${r.id})`);
        } catch (err: any) {
          this.logger.error(`补装扣减库存异常: ${err.message}`);
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
      const eqDisplay = r.equipmentIds || '未知装备';
      if (dto.action === 'reject' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyRejected(r.kookUserId, eqDisplay, r.quantity, dto.remark || '');
      } else if (dto.action === 'approve' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyApproved(r.kookUserId, eqDisplay, r.quantity);
      } else if (dto.action === 'dispatch' && r.kookUserId) {
        this.kookNotifyService.notifyResupplyDispatched(r.kookUserId, eqDisplay, r.dispatchQuantity || r.quantity);
      }
      this.kookNotifyService.notifyResupplyStatusChange(
        r.kookNickname || '未知', eqDisplay, r.quantity, r.status, dto.remark,
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

  /** 合并视图：同一用户+同一截图+同一天的多件装备合并为一行 */
  async getMergedList(guildId: number, query: QueryResupplyDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;

    // 先正常查询所有记录
    const qb = this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId });

    if (query.status !== undefined) qb.andWhere('r.status = :s', { s: query.status });
    if (query.keyword) {
      qb.andWhere('(r.equipmentIds LIKE :kw OR r.kookNickname LIKE :kw)', { kw: `%${query.keyword}%` });
    }
    if (query.startDate && query.endDate) {
      qb.andWhere('r.createdAt BETWEEN :startDate AND :endDate', {
        startDate: `${query.startDate} 00:00:00`, endDate: `${query.endDate} 23:59:59`,
      });
    }

    qb.orderBy('r.createdAt', 'DESC');
    const allItems = await qb.getMany();

    // 按 kookUserId + screenshotUrl + 日期 分组合并
    const groups = new Map<string, {
      key: string;
      kookUserId: string;
      kookNickname: string;
      resupplyBox: string | null;
      screenshotUrl: string | null;
      status: number;
      createdAt: Date;
      items: GuildResupply[];
      equipmentSummary: string;
      totalQuantity: number;
    }>();

    for (const item of allItems) {
      const dateKey = item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : 'unknown';
      const groupKey = `${item.kookUserId || 'manual'}_${item.screenshotUrl || item.id}_${dateKey}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          key: groupKey,
          kookUserId: item.kookUserId,
          kookNickname: item.kookNickname,
          resupplyBox: item.resupplyBox,
          screenshotUrl: item.screenshotUrl,
          status: item.status,
          createdAt: item.createdAt,
          items: [],
          equipmentSummary: '',
          totalQuantity: 0,
        });
      }
      const group = groups.get(groupKey)!;
      group.items.push(item);
      group.totalQuantity += item.quantity;
    }

    // 生成摘要
    const merged = Array.from(groups.values()).map(g => {
      g.equipmentSummary = g.items.map(i => `${i.equipmentIds || '?'} x${i.quantity}`).join('、');
      return g;
    });

    const total = merged.length;
    const paged = merged.slice((page - 1) * pageSize, page * pageSize);
    return { list: paged, total, page, pageSize };
  }

  /** 获取待处理记录按装备聚合排序（临时排序视图）
   * 支持关键词过滤（如 P8+堕神）
   */
  async getGroupedByEquipment(guildId: number, keyword?: string): Promise<GuildResupply[]> {
    const qb = this.resupplyRepo.createQueryBuilder('r')
      .where('r.guildId = :guildId', { guildId })
      .andWhere('r.status = :s', { s: ResupplyStatus.PENDING });

    if (keyword) {
      qb.andWhere('r.equipmentIds LIKE :kw', { kw: `%${keyword}%` });
    }

    qb.orderBy('r.equipmentIds', 'ASC')
      .addOrderBy('r.createdAt', 'ASC');

    return qb.getMany();
  }

  private async addLog(guildId: number, resupplyId: number, action: string, from: string | null, to: string, operatorId?: number, operatorName?: string, remark?: string) {
    await this.logRepo.save(this.logRepo.create({
      guildId, resupplyId, action, fromStatus: from, toStatus: to, operatorId, operatorName, remark,
    }));
  }

  /**
   * F-108: 快捷补装完成（待识别路径B）
   * 操作：更新装备列表+元数据 → 扣库存 → 标记为已通过+已发放（跳过常规审批流）
   * 适用：待识别条目经人工确认后直接完成补装
   */
  async quickComplete(
    guildId: number, id: number, dto: QuickCompleteResupplyDto,
    operatorId: number, operatorName: string,
  ) {
    const r = await this.resupplyRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('补装申请不存在');
    if (r.status === ResupplyStatus.DISPATCHED) {
      throw new BadRequestException('该申请已发放，不能重复快捷完成');
    }

    const fromStatus = String(r.status);

    // 1. 展开 equipmentEntries 到 equipmentIds（与 create 一致）
    let expandedIds: number[] = [];
    if (dto.equipmentEntries && dto.equipmentEntries.length > 0) {
      for (const entry of dto.equipmentEntries) {
        const times = Math.max(1, entry.quantity || 1);
        for (let i = 0; i < times; i++) expandedIds.push(entry.catalogId);
      }
    } else if (dto.equipmentIds) {
      expandedIds = dto.equipmentIds.split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    } else if (r.equipmentIds) {
      // 沿用原装备列表
      expandedIds = r.equipmentIds.split(',').filter(Boolean).map(Number).filter(n => !isNaN(n));
    }

    if (expandedIds.length === 0) {
      throw new BadRequestException('装备列表为空，无法完成补装');
    }

    // 2. 更新记录字段
    r.equipmentIds = expandedIds.join(',');
    r.quantity = expandedIds.length;
    if (dto.killDate) r.killDate = dto.killDate;
    if (dto.mapName) r.mapName = dto.mapName;
    if (dto.gameId) r.gameId = dto.gameId;
    if (dto.resupplyBox) r.resupplyBox = dto.resupplyBox;
    if (dto.kookNickname) r.kookNickname = dto.kookNickname;
    if (dto.remark) r.processRemark = dto.remark;

    // 3. 扣减库存（逐个 catalogId 扣 1）
    let deducted = 0;
    for (const catalogId of expandedIds) {
      if (!catalogId || isNaN(catalogId)) continue;
      try {
        await this.equipmentService.deductForDispatch(guildId, catalogId, 1, operatorId, operatorName);
        deducted++;
      } catch (err: any) {
        this.logger.warn(`[quickComplete] 扣减库存失败 catalogId=${catalogId}: ${err.message}`);
      }
    }
    this.logger.log(`[quickComplete] 申请ID=${id} 扣减库存: ${deducted}/${expandedIds.length} 件`);

    // 4. 标记为已发放（最终态）
    r.status = ResupplyStatus.DISPATCHED;
    r.processedBy = operatorId;
    r.processedAt = new Date();
    r.dispatchedBy = operatorId;
    r.dispatchedAt = new Date();
    r.dispatchQuantity = expandedIds.length;
    await this.resupplyRepo.save(r);

    await this.addLog(guildId, id, 'quick_complete', fromStatus, String(r.status), operatorId, operatorName,
      `快捷补装完成: 装备${expandedIds.length}件, 扣库存${deducted}件${dto.remark ? ' | ' + dto.remark : ''}`);

    return { id, status: r.status, deducted, total: expandedIds.length };
  }

  /**
   * F-108: 批量废弃补装申请
   * 将多条申请一键标记为 rejected
   */
  async batchReject(
    guildId: number, dto: BatchRejectDto, operatorId: number, operatorName: string,
  ) {
    if (!dto.ids || dto.ids.length === 0) return { updated: 0 };

    const items = await this.resupplyRepo.find({ where: { id: In(dto.ids), guildId } });
    let updated = 0;
    for (const r of items) {
      if (r.status === ResupplyStatus.DISPATCHED) continue; // 已发放的不能改
      const fromStatus = String(r.status);
      r.status = ResupplyStatus.REJECTED;
      r.processedBy = operatorId;
      r.processRemark = dto.remark || '批量废弃（待识别）';
      r.processedAt = new Date();
      await this.resupplyRepo.save(r);
      await this.addLog(guildId, r.id, 'batch_reject', fromStatus, String(r.status), operatorId, operatorName, dto.remark || '批量废弃');
      updated++;
    }
    return { updated, total: dto.ids.length };
  }

  // ===== V2.9.3 图像识别预览（方框Top5候选+勾选确认） =====

  /**
   * V2.9.3：获取补装申请的图像识别预览（原图 + 方框 + Top5 候选）
   * 用于详情 Modal 中点击"图像识别预览"后展示
   */
  async previewMatchForResupply(guildId: number, id: number, options?: { topN?: number; autoThreshold?: number }) {
    const r = await this.resupplyRepo.findOne({ where: { id, guildId } });
    if (!r) throw new NotFoundException('补装申请不存在');
    if (!r.screenshotUrl) throw new BadRequestException('该申请无截图，无法预览');
    const buffer = await this.fetchImageBuffer(r.screenshotUrl);
    if (!buffer) throw new BadRequestException('截图下载失败，请检查 URL');
    const preview = await this.imageMatchService.previewMatchWithCandidates(buffer, options);
    return { ...preview, originalUrl: r.screenshotUrl };
  }

  /**
   * V2.9.3：按 URL 直接预览（供待识别 Tab 无 resupplyId 时使用）
   */
  async previewMatchFromUrl(imageUrl: string, options?: { topN?: number; autoThreshold?: number }) {
    if (!imageUrl) throw new BadRequestException('imageUrl 必填');
    const buffer = await this.fetchImageBuffer(imageUrl);
    if (!buffer) throw new BadRequestException('截图下载失败，请检查 URL');
    const preview = await this.imageMatchService.previewMatchWithCandidates(buffer, options);
    return { ...preview, originalUrl: imageUrl };
  }

  /** 下载图片为 Buffer（支持相对路径/绝对 URL） */
  private async fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
    let fullUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
      fullUrl = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }
    try {
      const response = await fetch(fullUrl, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch (err) {
      this.logger.warn(`[V2.9.3] 图片下载失败 ${fullUrl}: ${err}`);
      return null;
    }
  }
}

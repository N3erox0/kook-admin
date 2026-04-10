import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GuildInventory } from './entities/guild-inventory.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { QueryInventoryDto, UpsertInventoryDto, UpdateInventoryFieldDto } from './dto/equipment.dto';
import { InventoryLogService, InventoryAction } from '../inventory-log/inventory-log.service';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);

  constructor(
    @InjectRepository(GuildInventory) private invRepo: Repository<GuildInventory>,
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    private dataSource: DataSource,
    private inventoryLogService: InventoryLogService,
  ) {}

  async findAll(guildId: number, query: QueryInventoryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;

    const qb = this.invRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.catalog', 'cat')
      .where('inv.guildId = :guildId', { guildId });

    if (query.keyword) qb.andWhere('cat.name LIKE :kw', { kw: `%${query.keyword}%` });
    if (query.level) qb.andWhere('cat.level = :level', { level: query.level });
    if (query.quality !== undefined) qb.andWhere('cat.quality = :quality', { quality: query.quality });
    if (query.gearScore) qb.andWhere('cat.gearScore = :gs', { gs: query.gearScore });
    if (query.category) qb.andWhere('cat.category = :cat', { cat: query.category });

    qb.orderBy('cat.category', 'ASC').addOrderBy('cat.name', 'ASC').addOrderBy('cat.level', 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async upsert(guildId: number, dto: UpsertInventoryDto, operatorId?: number, operatorName?: string, action?: string) {
    const catalog = await this.catalogRepo.findOne({ where: { id: dto.catalogId } });
    if (!catalog) throw new NotFoundException('装备参考不存在');

    let inv = await this.invRepo.findOne({ where: { guildId, catalogId: dto.catalogId } });
    const beforeQty = inv?.quantity || 0;
    const isNew = !inv;

    if (inv) {
      inv.quantity = dto.quantity;
      if (dto.location) inv.location = dto.location;
      if (dto.remark) inv.remark = dto.remark;
    } else {
      inv = this.invRepo.create({
        guildId,
        catalogId: dto.catalogId,
        quantity: dto.quantity,
        location: dto.location || '公会仓库',
        remark: dto.remark,
      });
    }
    const saved = await this.invRepo.save(inv);

    await this.inventoryLogService.createLog({
      guildId,
      inventoryId: saved.id,
      catalogId: dto.catalogId,
      equipmentName: catalog.name,
      action: action || (isNew ? InventoryAction.MANUAL_ADD : InventoryAction.MANUAL_EDIT),
      delta: dto.quantity - beforeQty,
      beforeQuantity: beforeQty,
      afterQuantity: dto.quantity,
      operatorId,
      operatorName,
      remark: dto.remark,
    });

    return saved;
  }

  async batchUpsert(guildId: number, items: UpsertInventoryDto[], operatorId?: number, operatorName?: string, action?: string) {
    let upserted = 0;
    for (const dto of items) {
      await this.upsert(guildId, dto, operatorId, operatorName, action || InventoryAction.CSV_IMPORT);
      upserted++;
    }
    return { upserted };
  }

  async updateFields(guildId: number, id: number, dto: UpdateInventoryFieldDto, operatorId?: number, operatorName?: string) {
    const inv = await this.invRepo.findOne({ where: { id, guildId }, relations: ['catalog'] });
    if (!inv) throw new NotFoundException('库存记录不存在');

    const beforeQty = inv.quantity;

    if (dto.quantity !== undefined) inv.quantity = dto.quantity;
    if (dto.location !== undefined) inv.location = dto.location;
    const saved = await this.invRepo.save(inv);

    if (dto.quantity !== undefined && dto.quantity !== beforeQty) {
      await this.inventoryLogService.createLog({
        guildId,
        inventoryId: id,
        catalogId: inv.catalogId,
        equipmentName: inv.catalog?.name,
        action: InventoryAction.MANUAL_EDIT,
        delta: dto.quantity - beforeQty,
        beforeQuantity: beforeQty,
        afterQuantity: dto.quantity,
        operatorId,
        operatorName,
        remark: dto.location !== undefined ? `位置变更为: ${dto.location}` : undefined,
      });
    }

    return saved;
  }

  async adjustQuantity(guildId: number, inventoryId: number, delta: number, operatorId?: number, operatorName?: string): Promise<GuildInventory> {
    const inv = await this.invRepo.findOne({ where: { id: inventoryId, guildId }, relations: ['catalog'] });
    if (!inv) throw new NotFoundException('库存记录不存在');

    const beforeQty = inv.quantity;
    const newQty = inv.quantity + delta;
    if (newQty < 0) throw new BadRequestException(`库存不足，当前 ${inv.quantity}，需扣减 ${Math.abs(delta)}`);
    inv.quantity = newQty;
    const saved = await this.invRepo.save(inv);

    await this.inventoryLogService.createLog({
      guildId,
      inventoryId,
      catalogId: inv.catalogId,
      equipmentName: inv.catalog?.name,
      action: InventoryAction.MANUAL_EDIT,
      delta,
      beforeQuantity: beforeQty,
      afterQuantity: newQty,
      operatorId,
      operatorName,
    });

    return saved;
  }

  /** 发放扣库存（事务） */
  async deductForDispatch(guildId: number, catalogId: number, quantity: number, operatorId?: number, operatorName?: string): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const inv = await qr.manager.findOne(GuildInventory, {
        where: { guildId, catalogId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!inv) {
        throw new BadRequestException('库存记录不存在');
      }

      if (inv.quantity < quantity) {
        throw new BadRequestException(`库存不足：当前 ${inv.quantity}，需发放 ${quantity}`);
      }

      const beforeQty = inv.quantity;
      inv.quantity -= quantity;
      await qr.manager.save(inv);
      await qr.commitTransaction();

      // 事务提交后写日志
      const catalog = await this.catalogRepo.findOne({ where: { id: catalogId } });
      await this.inventoryLogService.createLog({
        guildId,
        inventoryId: inv.id,
        catalogId,
        equipmentName: catalog?.name,
        action: InventoryAction.RESUPPLY_DEDUCT,
        delta: -quantity,
        beforeQuantity: beforeQty,
        afterQuantity: inv.quantity,
        operatorId,
        operatorName,
        remark: `补装发放扣减 ${quantity} 件`,
      });
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async remove(guildId: number, id: number, operatorId?: number, operatorName?: string) {
    const inv = await this.invRepo.findOne({ where: { id, guildId }, relations: ['catalog'] });
    if (inv) {
      await this.inventoryLogService.createLog({
        guildId,
        inventoryId: id,
        catalogId: inv.catalogId,
        equipmentName: inv.catalog?.name,
        action: InventoryAction.DELETE,
        delta: -inv.quantity,
        beforeQuantity: inv.quantity,
        afterQuantity: 0,
        operatorId,
        operatorName,
        remark: `删除库存记录`,
      });
    }
    await this.invRepo.delete({ id, guildId });
    return { id };
  }

  async getOverview(guildId: number) {
    const result = await this.invRepo.createQueryBuilder('inv')
      .leftJoin('inv.catalog', 'cat')
      .select('cat.category', 'category')
      .addSelect('SUM(inv.quantity)', 'total')
      .addSelect('COUNT(inv.id)', 'itemCount')
      .where('inv.guildId = :guildId', { guildId })
      .groupBy('cat.category')
      .getRawMany();

    const totalQuantity = result.reduce((sum, r) => sum + parseInt(r.total || '0'), 0);
    return { totalQuantity, byCategory: result };
  }
}

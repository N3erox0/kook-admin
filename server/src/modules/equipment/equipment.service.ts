import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { GuildInventory } from './entities/guild-inventory.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { QueryInventoryDto, UpsertInventoryDto, UpdateInventoryFieldDto } from './dto/equipment.dto';
import { InventoryLogService, InventoryAction } from '../inventory-log/inventory-log.service';
import { ImageMatchService } from '../ocr/image-match.service';
import { CatalogService } from '../equipment-catalog/catalog.service';
import { OcrService } from '../ocr/ocr.service';

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);

  constructor(
    @InjectRepository(GuildInventory) private invRepo: Repository<GuildInventory>,
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    private dataSource: DataSource,
    private inventoryLogService: InventoryLogService,
    @Inject(forwardRef(() => ImageMatchService)) private imageMatchService: ImageMatchService,
    private catalogService: CatalogService,
    @Inject(forwardRef(() => OcrService)) private ocrService: OcrService,
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

  // ===== V2.9.2 网格识别入库（方案D） =====

  /**
   * 解析截图网格：按图标切片 → 返回每格的缩略图+自动识别的数量/品质
   * 装备名由用户后续手动填写
   */
  async gridParse(imageUrl: string, layout?: string, anchor?: { x: number; y: number; w: number; h: number }): Promise<any> {
    // 获取图片 Buffer
    let buffer: Buffer;
    if (imageUrl.startsWith('http')) {
      const res = await fetch(imageUrl);
      if (!res.ok) throw new BadRequestException(`图片下载失败: HTTP ${res.status}`);
      buffer = Buffer.from(await res.arrayBuffer());
    } else {
      // 相对路径 → 本地文件
      const path = require('path');
      const fs = require('fs/promises');
      const absPath = path.join(process.cwd(), imageUrl.replace(/^\//, ''));
      buffer = await fs.readFile(absPath);
    }

    // V2.10.5: 半自动画框模式 — 有 anchor 时直接用锚点等间距切图
    if (anchor && anchor.w > 10 && anchor.h > 10) {
      this.logger.log(`[V2.10.5 gridParse] 半自动画框: anchor=(${anchor.x},${anchor.y},${anchor.w}x${anchor.h}), layout=${layout}`);
      const cropRegion = { topPercent: 0, bottomPercent: 0 }; // 不裁剪，直接用 anchor
      return this.imageMatchService.gridParseWithAnchor(buffer, layout || '5x7', anchor);
    }

    // V2.10: OCR 锚点定位装备区
    let cropRegion: { topPercent: number; bottomPercent: number } | undefined;
    if (layout) {
      try {
        // 上传图片后用 OCR 识别文字坐标找锚点
        const { detections } = await this.ocrService.recognizeImageWithCoords(imageUrl);
        if (detections.length > 0) {
          const sharp = require('sharp');
          const meta = await sharp(buffer).metadata();
          const imgH = meta.height || 1;

          // 箱子类锚点：搜索/等阶/类别
          const boxAnchors = ['搜索', '等阶', '类别'];
          // 背包类锚点：百分比数字如 720%、100%
          const bagAnchorRegex = /\d+%/;
          // 底部锚点：估计市价/全部移动/整理/堆叠
          const bottomAnchors = ['估计市价', '全部移动', '整理', '堆叠'];

          let topY = -1; // 装备区起点 y（锚点行底部）
          let bottomY = -1; // 装备区终点 y（底部锚点行顶部）

          for (const d of detections) {
            const text = d.text;
            // 箱子类顶部锚点
            if (boxAnchors.some(a => text.includes(a))) {
              const anchorBottom = d.y + d.height;
              if (anchorBottom > topY) topY = anchorBottom;
            }
            // 背包类顶部锚点
            if (bagAnchorRegex.test(text) && text.length <= 6) {
              const anchorBottom = d.y + d.height;
              if (anchorBottom > topY) topY = anchorBottom;
            }
            // 底部锚点
            if (bottomAnchors.some(a => text.includes(a))) {
              if (bottomY < 0 || d.y < bottomY) bottomY = d.y;
            }
          }

          if (topY > 0) {
            const topPercent = (topY + 5) / imgH; // +5px 间距
            const bottomPercent = bottomY > topY ? (imgH - bottomY + 5) / imgH : 0.05;
            cropRegion = {
              topPercent: Math.max(0.05, Math.min(topPercent, 0.50)),
              bottomPercent: Math.max(0.02, Math.min(bottomPercent, 0.20)),
            };
            this.logger.log(`[V2.10 gridParse] OCR锚点定位: topY=${topY}(${(cropRegion.topPercent * 100).toFixed(1)}%), bottomY=${bottomY}(${(cropRegion.bottomPercent * 100).toFixed(1)}%)`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`[V2.10 gridParse] OCR锚点检测失败，使用默认裁剪: ${err.message}`);
      }
    }

    return this.imageMatchService.gridParseForManualInput(buffer, layout, cropRegion);
  }

  /**
   * 保存网格识别结果：逐条用别名+等级+品质匹配 catalogId 后叠加入库
   * @returns 成功数、失败数、失败明细
   */
  async gridSave(
    guildId: number,
    items: Array<{ aliasName: string; level: number; quality: number; quantity: number; location?: string }>,
    operatorId?: number,
    operatorName?: string,
  ): Promise<{ success: number; failed: number; failures: Array<{ index: number; reason: string }> }> {
    let success = 0, failed = 0;
    const failures: Array<{ index: number; reason: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.aliasName || !it.aliasName.trim()) {
        failed++;
        failures.push({ index: i, reason: '装备别名为空' });
        continue;
      }
      if (!it.quantity || it.quantity <= 0) {
        failed++;
        failures.push({ index: i, reason: '数量无效' });
        continue;
      }

      try {
        // 1. 用别名模糊匹配参考库（0.7 阈值）
        const matches = await this.catalogService.findByNameFuzzy(it.aliasName, 0.7);
        // 2. 过滤 level + quality 相符的
        const valid = matches.filter(m => m.item.level === it.level && m.item.quality === it.quality);
        if (valid.length === 0) {
          failed++;
          failures.push({ index: i, reason: `未找到匹配装备: ${it.aliasName} T${it.level}Q${it.quality}` });
          continue;
        }
        const best = valid[0];
        // 3. 叠加入库
        await this.upsert(
          guildId,
          {
            catalogId: best.item.id,
            quantity: it.quantity,
            location: it.location || '公会仓库',
          },
          operatorId,
          operatorName,
          InventoryAction.OCR_IMPORT, // 用 ocr_import 类型（方案D也属于识别类）
        );
        success++;
      } catch (err: any) {
        failed++;
        failures.push({ index: i, reason: err.message || '未知错误' });
      }
    }

    this.logger.log(`[V2.9.2 gridSave] guild=${guildId} 成功=${success} 失败=${failed}`);
    return { success, failed, failures };
  }
}

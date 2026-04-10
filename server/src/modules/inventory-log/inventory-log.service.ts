import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryLog } from './entities/inventory-log.entity';

export enum InventoryAction {
  MANUAL_ADD = 'manual_add',
  MANUAL_EDIT = 'manual_edit',
  CSV_IMPORT = 'csv_import',
  OCR_IMPORT = 'ocr_import',
  RESUPPLY_DEDUCT = 'resupply_deduct',
  DELETE = 'delete',
}

export interface CreateInventoryLogDto {
  guildId: number;
  inventoryId?: number;
  catalogId?: number;
  equipmentName?: string;
  action: string;
  delta: number;
  beforeQuantity: number;
  afterQuantity: number;
  operatorId?: number;
  operatorName?: string;
  remark?: string;
}

@Injectable()
export class InventoryLogService {
  private readonly logger = new Logger(InventoryLogService.name);

  constructor(
    @InjectRepository(InventoryLog)
    private logRepo: Repository<InventoryLog>,
  ) {}

  async createLog(dto: CreateInventoryLogDto): Promise<InventoryLog> {
    const log = this.logRepo.create(dto);
    const saved = await this.logRepo.save(log);
    this.logger.log(
      `[公会${dto.guildId}] 库存变动: ${dto.action} | ${dto.equipmentName || ''} | ${dto.beforeQuantity}→${dto.afterQuantity} (${dto.delta > 0 ? '+' : ''}${dto.delta})`,
    );
    return saved;
  }

  async findByInventoryId(guildId: number, inventoryId: number, page = 1, pageSize = 20) {
    const [list, total] = await this.logRepo.findAndCount({
      where: { guildId, inventoryId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findByCatalogId(guildId: number, catalogId: number, page = 1, pageSize = 20) {
    const [list, total] = await this.logRepo.findAndCount({
      where: { guildId, catalogId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  async findByGuild(guildId: number, page = 1, pageSize = 50) {
    const [list, total] = await this.logRepo.findAndCount({
      where: { guildId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }
}

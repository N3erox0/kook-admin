import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { EquipmentImage } from '../equipment-catalog/entities/equipment-image.entity';

/**
 * V3.0 精简版 ImageMatchService
 * pHash/网格切割/图片匹配已移除，仅保留接口兼容的空实现
 * 装备识别改为通过 Albion Killboard API 结构化数据获取
 */
@Injectable()
export class ImageMatchService {
  private readonly logger = new Logger(ImageMatchService.name);

  constructor(
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    @InjectRepository(EquipmentImage) private imageRepo: Repository<EquipmentImage>,
  ) {}

  /**
   * @deprecated V3.0 已废弃，装备识别改为战报匹配
   */
  async matchFromScreenshot(_imageUrl: string, _options?: any): Promise<any[]> {
    this.logger.warn('matchFromScreenshot 已废弃(V3.0)，请使用战报匹配');
    return [];
  }

  /**
   * @deprecated V3.0 已废弃
   */
  async batchGeneratePhash(_force?: boolean): Promise<{ processed: number; errors: number }> {
    this.logger.warn('batchGeneratePhash 已废弃(V3.0)');
    return { processed: 0, errors: 0 };
  }

  /**
   * @deprecated V3.0 已废弃
   */
  async gridParseFromScreenshot(_imageUrl: string, _layoutType?: string): Promise<any> {
    this.logger.warn('gridParseFromScreenshot 已废弃(V3.0)');
    return { cells: [], matchedCount: 0, totalCells: 0 };
  }

  /**
   * @deprecated V3.0 已废弃
   */
  async gridParseByRegion(_buffer: Buffer, _cols: number, _rows: number, _outerRect?: any, _anchorCell?: any): Promise<any> {
    this.logger.warn('gridParseByRegion 已废弃(V3.0)');
    return { cells: [], matchedCount: 0, totalCells: 0 };
  }

  /**
   * @deprecated V3.0 已废弃，保留接口兼容
   */
  async previewMatchWithCandidates(_buffer: Buffer, _options?: any): Promise<any> {
    this.logger.warn('previewMatchWithCandidates 已废弃(V3.0)');
    return { cells: [], totalCells: 0, matchedCount: 0 };
  }

  /**
   * @deprecated V3.0 已废弃
   */
  async matchKillDetailSlots(_buffer: Buffer): Promise<any[]> {
    this.logger.warn('matchKillDetailSlots 已废弃(V3.0)');
    return [];
  }
}

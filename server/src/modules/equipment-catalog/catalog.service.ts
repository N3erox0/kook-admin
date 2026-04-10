import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EquipmentCatalog } from './entities/equipment-catalog.entity';
import { EquipmentImage } from './entities/equipment-image.entity';
import { CreateCatalogDto, UpdateCatalogDto, QueryCatalogDto } from './dto/catalog.dto';

/** Levenshtein 编辑距离 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityScore(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    @InjectRepository(EquipmentImage) private imageRepo: Repository<EquipmentImage>,
  ) {}

  async findAll(query: QueryCatalogDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const qb = this.catalogRepo.createQueryBuilder('c');

    if (query.keyword) qb.andWhere('c.name LIKE :kw', { kw: `%${query.keyword}%` });
    if (query.level) qb.andWhere('c.level = :level', { level: query.level });
    if (query.quality !== undefined) qb.andWhere('c.quality = :quality', { quality: query.quality });
    if (query.category) qb.andWhere('c.category = :category', { category: query.category });
    if (query.gearScore) qb.andWhere('c.gearScore = :gs', { gs: query.gearScore });

    qb.orderBy('c.category', 'ASC').addOrderBy('c.name', 'ASC').addOrderBy('c.level', 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async findById(id: number) {
    const item = await this.catalogRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('装备参考不存在');
    // 附带图片
    const images = await this.imageRepo.find({ where: { catalogId: id }, order: { sortOrder: 'ASC' } });
    return { ...item, images };
  }

  async create(dto: CreateCatalogDto) {
    // 检查唯一性
    const exists = await this.catalogRepo.findOne({
      where: { name: dto.name, level: dto.level, quality: dto.quality, category: dto.category },
    });
    if (exists) throw new ConflictException(`装备已存在: ${dto.name} Lv${dto.level} Q${dto.quality} ${dto.category}`);

    const item = this.catalogRepo.create({
      ...dto,
      gearScore: dto.gearScore ?? (dto.level + dto.quality),
    });
    return this.catalogRepo.save(item);
  }

  async update(id: number, dto: UpdateCatalogDto) {
    const item = await this.catalogRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('装备参考不存在');
    Object.assign(item, dto);
    if (dto.level !== undefined || dto.quality !== undefined) {
      item.gearScore = dto.gearScore ?? (item.level + item.quality);
    }
    return this.catalogRepo.save(item);
  }

  async remove(id: number) {
    await this.catalogRepo.delete(id);
    return { id };
  }

  /** CSV 批量导入 — 返回成功/跳过/失败详情 */
  async csvImport(rows: CreateCatalogDto[]): Promise<{
    success: number; skipped: number; failed: number;
    details: { index: number; name: string; status: string; message?: string }[];
  }> {
    let success = 0, skipped = 0, failed = 0;
    const details: { index: number; name: string; status: string; message?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const dto = rows[i];
      try {
        const exists = await this.catalogRepo.findOne({
          where: { name: dto.name, level: dto.level, quality: dto.quality, category: dto.category },
        });
        if (exists) {
          skipped++;
          details.push({ index: i, name: dto.name, status: 'skipped', message: '已存在' });
          continue;
        }
        const item = this.catalogRepo.create({
          ...dto,
          gearScore: dto.gearScore ?? (dto.level + dto.quality),
        });
        await this.catalogRepo.save(item);
        success++;
        details.push({ index: i, name: dto.name, status: 'success' });
      } catch (err: any) {
        failed++;
        details.push({ index: i, name: dto.name, status: 'failed', message: err.message });
      }
    }

    this.logger.log(`CSV导入完成: 成功${success}, 跳过${skipped}, 失败${failed}`);
    return { success, skipped, failed, details };
  }

  async batchCreate(items: CreateCatalogDto[]) {
    const entities = items.map((dto) =>
      this.catalogRepo.create({
        ...dto,
        gearScore: dto.gearScore ?? (dto.level + dto.quality),
      }),
    );
    return this.catalogRepo.save(entities);
  }

  /** Levenshtein 模糊匹配 */
  async findByNameFuzzy(name: string, threshold = 0.8): Promise<{ item: EquipmentCatalog; score: number }[]> {
    const all = await this.catalogRepo.find();
    const results: { item: EquipmentCatalog; score: number }[] = [];
    const lowerName = name.toLowerCase();

    for (const item of all) {
      const itemName = item.name.toLowerCase();
      const score = similarityScore(lowerName, itemName);
      if (score >= threshold) {
        results.push({ item, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /** 批量精确匹配 */
  async batchMatch(items: { name: string; level: number; quality: number }[]) {
    const all = await this.catalogRepo.find();
    return items.map((req, index) => {
      const match = all.find(
        (c) => c.name === req.name && c.level === req.level && c.quality === req.quality,
      );
      return { index, catalogId: match?.id || null, catalogName: match?.name || null };
    });
  }

  // ===== 图片管理 =====

  async addImage(catalogId: number, data: { imageUrl: string; imageType?: string; fileName?: string; fileSize?: number; isPrimary?: boolean }) {
    await this.findById(catalogId);
    const image = this.imageRepo.create({
      catalogId,
      imageUrl: data.imageUrl,
      imageType: data.imageType || 'icon',
      fileName: data.fileName,
      fileSize: data.fileSize,
      isPrimary: data.isPrimary ? 1 : 0,
    });
    return this.imageRepo.save(image);
  }

  async getImages(catalogId: number) {
    return this.imageRepo.find({ where: { catalogId }, order: { sortOrder: 'ASC', createdAt: 'DESC' } });
  }

  async removeImage(imageId: number) {
    await this.imageRepo.delete(imageId);
    return { id: imageId };
  }

  async setPrimaryImage(catalogId: number, imageId: number) {
    // 先取消所有主图
    await this.imageRepo.update({ catalogId }, { isPrimary: 0 });
    // 设置新主图
    await this.imageRepo.update(imageId, { isPrimary: 1 });
    // 同时更新 catalog 的 imageUrl
    const img = await this.imageRepo.findOne({ where: { id: imageId } });
    if (img) {
      await this.catalogRepo.update(catalogId, { imageUrl: img.imageUrl });
    }
    return { catalogId, imageId };
  }

  /** 搜索装备（模糊匹配，用于库存录入下拉） */
  async search(keyword: string, limit = 20) {
    return this.catalogRepo.createQueryBuilder('c')
      .where('c.name LIKE :kw', { kw: `%${keyword}%` })
      .orderBy('c.name', 'ASC')
      .take(limit)
      .getMany();
  }
}

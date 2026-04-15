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

    if (query.keyword) qb.andWhere('(c.name LIKE :kw OR c.aliases LIKE :kw)', { kw: `%${query.keyword}%` });
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
  async search(keyword: string, limit = 200) {
    return this.catalogRepo.createQueryBuilder('c')
      .where('c.name LIKE :kw', { kw: `%${keyword}%` })
      .orderBy('c.level', 'ASC')
      .addOrderBy('c.quality', 'ASC')
      .addOrderBy('c.name', 'ASC')
      .take(limit)
      .getMany();
  }

  // ===== Albion Online 装备数据导入 =====

  private static readonly ALBION_ITEMS_URL = 'https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.json';
  private static readonly ALBION_RENDER_URL = 'https://render.albiononline.com/v1/item/{name}.png?size=217';

  // 排除规则（优先）— 注意：_LEATHER/_CLOTH 改为精确材料匹配，避免误杀皮甲/布甲装备
  private static readonly EXCLUDE_KW = [
    'GATHER_', '_GATHER', '_ROCK', '_ORE', '_WOOD', '_FIBER', '_HIDE',
    '_PLANKS', '_METALBAR', '_STONEBLOCK',
    'LEATHER_ROYAL', 'CLOTH_ROYAL',
    '_LEVEL', 'ARTEFACT', 'SKILLBOOK', 'JOURNAL', 'FISH_', 'MOUNTUPGRADE',
    'FURNITURE', 'UNIQUE_FURNITURE', 'DECORATION', 'FARM', 'SEED',
    '_RUNE', '_SOUL', '_RELIC', '_SHARD', 'TRASH', 'TOKEN', 'EVENT_',
    'QUESTITEM', 'LOOTCHEST', 'UNIQUE_UNLOCK', 'VANITY', 'BACKPACK_SKIN',
    'PAPERDOLL', 'EMOTE', 'FLAG', 'BANNER', 'CREST', 'CONTRACT',
  ];

  // 包含规则
  private static readonly INCLUDE_KW = [
    '_HEAD_', '_ARMOR_', '_SHOES_', '_CAPE', '_BAG',
    '_MAIN_', '_OFF_', '_2H_', '_TRINKET_',
    'PLATE_SET', 'LEATHER_SET', 'CLOTH_SET',
    'HELLION', 'MERCENARY', 'ROYAL', 'STALKER', 'SOLDIER',
    'KNIGHT', 'CULTIST', 'DRUID', 'HUNTER', 'MAGE', 'GUARDIAN',
    'SWORD', 'AXE', 'HAMMER', 'SPEAR', 'DAGGER',
    'CROSSBOW', 'BOW',
    'STAFF', 'ARCANE', 'CURSED', 'FIRE', 'FROST', 'HOLY', 'NATURE',
    'SHIELD', 'TORCH', 'TOTEM', 'ORB', 'BOOK', 'QUARTERSTAFF',
    '_MOUNT_', 'MOUNT_',
    'POTION', 'MEAL', 'SANDWICH', 'STEW', 'PIE', 'SOUP', 'SALAD', 'OMELETTE',
  ];

  /** 从 Albion uniqueName 解析装备部位 */
  static parseCategory(uniqueName: string): string {
    const u = uniqueName.toUpperCase();
    if (u.includes('_HEAD_')) return '头';
    if (u.includes('_ARMOR_')) return '甲';
    if (u.includes('_SHOES_')) return '鞋';
    if (u.includes('_CAPE')) return '披风';
    if (u.includes('_MOUNT') || u.includes('MOUNT_')) return '坐骑';
    if (u.includes('POTION')) return '药水';
    if (u.includes('MEAL') || u.includes('SANDWICH') || u.includes('STEW') || u.includes('PIE') || u.includes('SOUP') || u.includes('SALAD') || u.includes('OMELETTE')) return '食物';
    if (u.includes('_OFF_') || u.includes('SHIELD') || u.includes('TORCH') || u.includes('TOTEM') || u.includes('_ORB') || u.includes('BOOK')) return '副手';
    if (u.includes('_MAIN_') || u.includes('_2H_') || u.includes('SWORD') || u.includes('AXE') || u.includes('HAMMER') || u.includes('SPEAR') || u.includes('DAGGER') || u.includes('CROSSBOW') || u.includes('BOW') || u.includes('STAFF') || u.includes('ARCANE') || u.includes('CURSED') || u.includes('FIRE') || u.includes('FROST') || u.includes('HOLY') || u.includes('NATURE') || u.includes('QUARTERSTAFF')) return '武器';
    if (u.includes('_BAG') || u.includes('_TRINKET_')) return '其他';
    return '其他';
  }

  /** 判断 uniqueName 是否为有效物品（排除材料/采集装备） */
  private static isValidItem(name: string): boolean {
    const u = name.toUpperCase();
    if (CatalogService.EXCLUDE_KW.some(kw => u.includes(kw))) return false;
    // 额外排除纯材料：T*_LEATHER 和 T*_CLOTH（不含 _SET/_HEAD/_ARMOR/_SHOES 等装备后缀）
    if (/^T\d+_LEATHER$/.test(u) || /^T\d+_CLOTH$/.test(u)) return false;
    return CatalogService.INCLUDE_KW.some(kw => u.includes(kw));
  }

  /** 从 uniqueName 提取阶数 */
  private static getTier(name: string): number {
    if (name.length >= 2 && name[0] === 'T' && name[1] >= '0' && name[1] <= '9') return parseInt(name[1]);
    return 0;
  }

  /** 解析品质：@N 后缀，如 T8_2H_HALBERD@4 → 4 */
  private static getQuality(name: string): number {
    const atIdx = name.indexOf('@');
    if (atIdx >= 0) {
      const q = parseInt(name.slice(atIdx + 1));
      return isNaN(q) ? 0 : Math.min(q, 4);
    }
    return 0;
  }

  /**
   * 从 Albion Online 公开 API 拉取装备数据并导入参考库
   * 每件装备自动生成 Q0~Q4 共5个品质变体，确保覆盖装等 40~84
   * @param minTier 最低阶数（0=全部，建议4）
   */
  async importFromAlbion(minTier = 4): Promise<{
    total: number; imported: number; updated: number; skipped: number; failed: number;
  }> {
    this.logger.log(`开始从 Albion API 拉取装备数据 (minTier=${minTier})...`);

    // 1. 拉取 items.json
    const response = await fetch(CatalogService.ALBION_ITEMS_URL, {
      headers: { 'User-Agent': 'kook-admin/1.0' },
    });
    if (!response.ok) throw new Error(`拉取 Albion 数据失败: HTTP ${response.status}`);
    const rawData: any[] = await response.json();
    this.logger.log(`原始数据 ${rawData.length} 条`);

    // 2. 过滤物品 + 为每件装备生成 Q0~Q4 品质变体
    const items: { uniqueName: string; zhName: string; enName: string; tier: number; quality: number; imageUrl: string }[] = [];
    for (const r of rawData) {
      const name = r.UniqueName;
      if (!name) continue;
      // 跳过已带 @N 后缀的（避免重复）
      if (name.includes('@')) continue;
      if (!CatalogService.isValidItem(name)) continue;
      const tier = CatalogService.getTier(name);
      if (minTier > 0 && tier < minTier) continue;

      const lnames = r.LocalizedNames || {};
      const zhName = lnames['ZH-CN'] || lnames['ZH-TW'] || '';
      const enName = lnames['EN-US'] || '';

      // 为每件装备生成 Q0~Q4 共5个变体
      for (let q = 0; q <= 4; q++) {
        const uniqueWithQ = q === 0 ? name : `${name}@${q}`;
        items.push({
          uniqueName: uniqueWithQ,
          zhName,
          enName,
          tier,
          quality: q,
          imageUrl: CatalogService.ALBION_RENDER_URL.replace('{name}', uniqueWithQ),
        });
      }
    }
    this.logger.log(`过滤+品质展开后物品 ${items.length} 件（含 Q0~Q4 变体）`);

    // 3. Upsert 到数据库（以 albionId 去重）
    let imported = 0, updated = 0, skipped = 0, failed = 0;

    for (const item of items) {
      try {
        if (!item.zhName && !item.enName) { skipped++; continue; }

        const displayName = item.zhName || item.enName;
        const category = CatalogService.parseCategory(item.uniqueName);

        const existing = await this.catalogRepo.findOne({ where: { albionId: item.uniqueName } });
        if (existing) {
          let changed = false;
          if (item.zhName && existing.name !== displayName) { existing.name = displayName; changed = true; }
          if (item.imageUrl && existing.imageUrl !== item.imageUrl) { existing.imageUrl = item.imageUrl; changed = true; }
          if (existing.quality !== item.quality) { existing.quality = item.quality; changed = true; }
          if (existing.gearScore !== item.tier + item.quality) { existing.gearScore = item.tier + item.quality; changed = true; }
          if (changed) {
            await this.catalogRepo.save(existing);
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // 新增
        const catalog = this.catalogRepo.create({
          name: displayName,
          albionId: item.uniqueName,
          level: item.tier || 1,
          quality: item.quality,
          category,
          gearScore: item.tier + item.quality,
          imageUrl: item.imageUrl,
          description: `${item.enName} (${item.uniqueName})`,
        });
        await this.catalogRepo.save(catalog);
        imported++;
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY') { skipped++; }
        else { failed++; this.logger.warn(`导入失败 ${item.uniqueName}: ${err.message}`); }
      }
    }

    this.logger.log(`Albion导入完成: 新增${imported} 更新${updated} 跳过${skipped} 失败${failed}`);
    return { total: items.length, imported, updated, skipped, failed };
  }
}

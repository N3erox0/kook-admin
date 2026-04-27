import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EquipmentCatalog } from './entities/equipment-catalog.entity';
import { EquipmentImage } from './entities/equipment-image.entity';
import { CreateCatalogDto, UpdateCatalogDto, QueryCatalogDto } from './dto/catalog.dto';
import { join } from 'path';
import * as fs from 'fs/promises';

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

  /** 中文等级前缀（Albion导入的装备名都带这些） */
  private static readonly TIER_PREFIXES = ['新手级', '学徒级', '熟练级', '老手级', '专家级', '大师级', '宗师级', '禅师级'];

  /** Levenshtein 模糊匹配（支持去等级前缀+别称） */
  async findByNameFuzzy(name: string, threshold = 0.8): Promise<{ item: EquipmentCatalog; score: number }[]> {
    const all = await this.catalogRepo.find();
    const results: { item: EquipmentCatalog; score: number }[] = [];
    const lowerName = name.toLowerCase();

    for (const item of all) {
      const itemName = item.name.toLowerCase();

      // 1. 直接匹配全名
      let score = similarityScore(lowerName, itemName);

      // 2. 去掉中文等级前缀后匹配（"禅师级牧师风帽" → "牧师风帽"）
      let strippedName = item.name;
      for (const prefix of CatalogService.TIER_PREFIXES) {
        if (strippedName.startsWith(prefix)) {
          strippedName = strippedName.slice(prefix.length);
          break;
        }
      }
      if (strippedName !== item.name) {
        const strippedScore = similarityScore(lowerName, strippedName.toLowerCase());
        if (strippedScore > score) score = strippedScore;
      }

      // 3. 别称匹配
      if (item.aliases) {
        const aliasList = item.aliases.split(',').map(a => a.trim().toLowerCase()).filter(Boolean);
        for (const alias of aliasList) {
          const aliasScore = similarityScore(lowerName, alias);
          if (aliasScore > score) score = aliasScore;
        }
      }

      // 4. 输入包含在名字中（子串匹配加分）
      if (itemName.includes(lowerName) || strippedName.toLowerCase().includes(lowerName)) {
        score = Math.max(score, 0.85);
      }

      if (score >= threshold) {
        results.push({ item, score });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * 批量匹配（V2.9.1: 支持别称/模糊匹配）
   * 匹配策略：
   * 1. 先按 name + level + quality 精确匹配
   * 2. 失败后用 findByNameFuzzy 模糊匹配（包含别称），取 level+quality 也相等的最高分结果
   */
  async batchMatch(items: { name: string; level: number; quality: number }[]) {
    const all = await this.catalogRepo.find();
    const results: { index: number; catalogId: number | null; catalogName: string | null; matchType: 'exact' | 'alias' | 'fuzzy' | 'none'; score?: number }[] = [];

    for (let i = 0; i < items.length; i++) {
      const req = items[i];

      // 1. 精确匹配
      const exact = all.find(
        (c) => c.name === req.name && c.level === req.level && c.quality === req.quality,
      );
      if (exact) {
        results.push({ index: i, catalogId: exact.id, catalogName: exact.name, matchType: 'exact' });
        continue;
      }

      // 2. 模糊匹配（别称/去前缀/子串）— 阈值 0.7
      const fuzzyMatches = await this.findByNameFuzzy(req.name, 0.7);
      // 仅保留 level + quality 完全匹配的
      const validMatches = fuzzyMatches.filter(m => m.item.level === req.level && m.item.quality === req.quality);

      if (validMatches.length > 0) {
        const best = validMatches[0]; // findByNameFuzzy 已按 score 降序
        // 判断是别称匹配还是模糊匹配
        const isAliasMatch = best.item.aliases && best.item.aliases.split(',').some(a => a.trim().toLowerCase() === req.name.toLowerCase());
        results.push({
          index: i,
          catalogId: best.item.id,
          catalogName: best.item.name,
          matchType: isAliasMatch ? 'alias' : 'fuzzy',
          score: best.score,
        });
      } else {
        results.push({ index: i, catalogId: null, catalogName: null, matchType: 'none' });
      }
    }

    return results;
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

  /**
   * 搜索装备（模糊匹配，用于库存录入下拉）
   * V2.9.5: 支持多种输入格式：
   *  - P8堕神 / P8 堕神 → 按装等+名称搜索
   *  - 80牧师风帽 / 62堕神 → 按level+quality+名称搜索
   *  - 冰箱头 → 同时匹配 name 和 aliases
   *  - 普通关键词 → name + aliases 双字段模糊
   */
  async search(keyword: string, limit = 200) {
    if (!keyword || !keyword.trim()) return [];
    const raw = keyword.trim();

    // 1. 解析 P{装等} 前缀: "P8堕神" / "P8 堕神"
    const pMatch = raw.match(/^[pP](\d{1,2})\s*(.*)$/);
    if (pMatch) {
      const gs = parseInt(pMatch[1]);
      const name = pMatch[2].trim();
      const qb = this.catalogRepo.createQueryBuilder('c')
        .where('c.gearScore = :gs', { gs });
      if (name) {
        qb.andWhere('(c.name LIKE :kw OR c.aliases LIKE :kw)', { kw: `%${name}%` });
      }
      return qb.orderBy('c.level', 'ASC').addOrderBy('c.quality', 'ASC').addOrderBy('c.name', 'ASC').take(limit).getMany();
    }

    // 2. 解析数字前缀: "80牧师风帽" → level=8, quality=0, name=牧师风帽
    //    "62堕神" → level=6, quality=2, name=堕神
    const lvqMatch = raw.match(/^(\d)(\d)(.{2,})$/);
    if (lvqMatch) {
      const lv = parseInt(lvqMatch[1]);
      const q = parseInt(lvqMatch[2]);
      const name = lvqMatch[3].trim();
      if (lv >= 1 && lv <= 8 && q >= 0 && q <= 4) {
        return this.catalogRepo.createQueryBuilder('c')
          .where('c.level = :lv', { lv })
          .andWhere('c.quality = :q', { q })
          .andWhere('(c.name LIKE :kw OR c.aliases LIKE :kw)', { kw: `%${name}%` })
          .orderBy('c.name', 'ASC')
          .take(limit)
          .getMany();
      }
    }

    // 3. 通用搜索: name + aliases 双字段模糊
    return this.catalogRepo.createQueryBuilder('c')
      .where('(c.name LIKE :kw OR c.aliases LIKE :kw)', { kw: `%${raw}%` })
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

  // ===== 批量下载装备图片到本地 =====

  /**
   * 批量下载 Albion 远程装备图片到服务器本地
   * 存储路径：uploads/catalog/{albionId}.png
   * 已存在且文件有效的自动跳过（幂等）
   * @param concurrency 并发下载数（默认10）
   */
  async downloadAllImages(concurrency = 10): Promise<{
    total: number; downloaded: number; skipped: number; failed: number;
  }> {
    const uploadDir = join(process.cwd(), 'uploads', 'catalog');
    await fs.mkdir(uploadDir, { recursive: true });

    // 查询所有有 imageUrl（远程URL）的记录
    const catalogs = await this.catalogRepo.find({
      select: ['id', 'imageUrl', 'localImagePath', 'albionId'],
    });

    const needDownload = catalogs.filter(c => c.imageUrl && c.imageUrl.startsWith('http'));
    this.logger.log(`批量下载装备图片: 总计 ${needDownload.length} 条记录（并发=${concurrency}）`);

    let downloaded = 0, skipped = 0, failed = 0;

    // 分批并发下载
    for (let i = 0; i < needDownload.length; i += concurrency) {
      const batch = needDownload.slice(i, i + concurrency);
      const promises = batch.map(async (cat) => {
        try {
          // 生成本地文件名：用 albionId（如T4_2H_CLAYMORE@2.png），无 albionId 则用 id
          const fileName = cat.albionId
            ? `${cat.albionId.replace(/[<>:"/\\|?*]/g, '_')}.png`
            : `catalog_${cat.id}.png`;
          const localPath = join(uploadDir, fileName);
          const relativePath = `/uploads/catalog/${fileName}`;

          // 幂等检查：文件已存在且大小 > 0 则跳过
          if (cat.localImagePath) {
            try {
              const absPath = join(process.cwd(), cat.localImagePath.replace(/^\//, ''));
              const stat = await fs.stat(absPath);
              if (stat.size > 0) {
                skipped++;
                return;
              }
            } catch { /* 文件不存在，继续下载 */ }
          }

          // 也检查物理文件（可能之前下载了但DB未更新）
          try {
            const stat = await fs.stat(localPath);
            if (stat.size > 0) {
              // 文件存在但 DB 未记录 → 更新 DB
              if (cat.localImagePath !== relativePath) {
                await this.catalogRepo.update(cat.id, { localImagePath: relativePath });
              }
              skipped++;
              return;
            }
          } catch { /* 文件不存在，继续下载 */ }

          // 下载（3次重试）
          let buffer: Buffer | null = null;
          for (let retry = 0; retry < 3; retry++) {
            try {
              const response = await fetch(cat.imageUrl, {
                headers: { 'User-Agent': 'kook-admin/1.0' },
                signal: AbortSignal.timeout(15000),
              });
              if (!response.ok) {
                if (retry < 2) { await this.sleep(500 * (retry + 1)); continue; }
                throw new Error(`HTTP ${response.status}`);
              }
              buffer = Buffer.from(await response.arrayBuffer());
              break;
            } catch (err) {
              if (retry >= 2) throw err;
              await this.sleep(500 * (retry + 1));
            }
          }

          if (!buffer || buffer.length === 0) {
            failed++;
            return;
          }

          // 写入本地文件
          await fs.writeFile(localPath, buffer);

          // 更新数据库
          await this.catalogRepo.update(cat.id, { localImagePath: relativePath });
          downloaded++;
        } catch (err: any) {
          failed++;
          if (failed <= 10) {
            this.logger.warn(`下载失败 ${cat.albionId || cat.id}: ${err.message}`);
          }
        }
      });

      await Promise.all(promises);

      // 每 100 条打印进度
      if ((i + concurrency) % 100 < concurrency) {
        this.logger.log(`下载进度: ${Math.min(i + concurrency, needDownload.length)}/${needDownload.length} (下载${downloaded}/跳过${skipped}/失败${failed})`);
      }
    }

    this.logger.log(`批量下载完成: 下载${downloaded}, 跳过${skipped}, 失败${failed}, 总计${needDownload.length}`);
    return { total: needDownload.length, downloaded, skipped, failed };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** V2.9.8: 批量更新装备别称（按ID） */
  async batchUpdateAliases(items: { id: number; aliases: string }[]): Promise<{
    updated: number; skipped: number; notFound: number;
  }> {
    let updated = 0, skipped = 0, notFound = 0;
    for (const item of items) {
      const existing = await this.catalogRepo.findOne({ where: { id: item.id } });
      if (!existing) { notFound++; continue; }
      const newAliases = (item.aliases || '').trim() || null;
      if (existing.aliases === newAliases) { skipped++; continue; }
      // 只在 CSV 提供了非空别称时才更新（空值不覆盖已有别称）
      if (!newAliases && existing.aliases) { skipped++; continue; }
      existing.aliases = newAliases;
      await this.catalogRepo.save(existing);
      updated++;
    }
    this.logger.log(`批量别称更新: 更新${updated}, 跳过${skipped}, 未找到${notFound}`);
    return { updated, skipped, notFound };
  }

  // ===== V2.9.8: 热门装备游戏截图管理 =====

  /**
   * 上传热门装备游戏截图
   * 保存到 uploads/catalog-hot/{catalogId}.png
   * 更新 hotImagePath 字段并重算 pHash
   */
  async uploadHotImage(catalogId: number, file: { buffer: Buffer; originalname: string; mimetype: string }): Promise<any> {
    const item = await this.catalogRepo.findOne({ where: { id: catalogId } });
    if (!item) throw new NotFoundException('装备参考不存在');

    const uploadDir = join(process.cwd(), 'uploads', 'catalog-hot');
    await fs.mkdir(uploadDir, { recursive: true });

    const ext = file.originalname.split('.').pop() || 'png';
    const fileName = `hot_${catalogId}.${ext}`;
    const localPath = join(uploadDir, fileName);
    const relativePath = `/uploads/catalog-hot/${fileName}`;

    await fs.writeFile(localPath, file.buffer);

    // 更新 DB
    item.hotImagePath = relativePath;
    await this.catalogRepo.save(item);

    // 重算 pHash（使用热门截图）
    let newPhash: string | null = null;
    try {
      const { ImageMatchService } = await import('../ocr/image-match.service');
      // 手动计算 pHash（不依赖注入，直接用文件）
      const sharp = require('sharp');
      const buffer = file.buffer;
      // 遮盖角标+裁切中心60%+计算pHash
      const meta = await sharp(buffer).metadata();
      const w = meta.width || 64;
      const h = meta.height || 64;
      const cornerSize = Math.round(Math.max(w, h) * 0.20);
      const brCornerW = Math.round(w * 0.25);
      const brCornerH = Math.round(h * 0.25);
      const blackTL = await sharp({ create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
      const blackTR = await sharp({ create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
      const blackBR = await sharp({ create: { width: brCornerW, height: brCornerH, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
      const masked = await sharp(buffer)
        .flatten({ background: { r: 0, g: 0, b: 0 } })
        .composite([
          { input: blackTL, left: 0, top: 0 },
          { input: blackTR, left: w - cornerSize, top: 0 },
          { input: blackBR, left: w - brCornerW, top: h - brCornerH },
        ])
        .toBuffer();
      const ratio = 0.60;
      const cropW = Math.round(w * ratio);
      const cropH = Math.round(h * ratio);
      const cropLeft = Math.round((w - cropW) / 2);
      const cropTop = Math.round((h - cropH) / 2);
      const cropped = await sharp(masked).extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH }).toBuffer();
      const pixels = await sharp(cropped).flatten({ background: { r: 0, g: 0, b: 0 } }).resize(32, 32, { fit: 'fill' }).grayscale().raw().toBuffer();
      // DCT + pHash（简化：直接更新DB，让batchGeneratePhash来做）
      this.logger.log(`[V2.9.8] 热门截图上传成功 catalogId=${catalogId}, file=${fileName}, 需重算pHash`);
    } catch (err) {
      this.logger.warn(`[V2.9.8] 热门截图pHash计算失败: ${err}`);
    }

    return { id: catalogId, hotImagePath: relativePath, message: '热门截图上传成功，请执行"生成图片指纹"重算pHash' };
  }

  /**
   * 删除热门装备截图（恢复使用原始Albion图片的pHash）
   */
  async deleteHotImage(catalogId: number): Promise<any> {
    const item = await this.catalogRepo.findOne({ where: { id: catalogId } });
    if (!item) throw new NotFoundException('装备参考不存在');

    if (item.hotImagePath) {
      // 删除本地文件
      try {
        const absPath = join(process.cwd(), item.hotImagePath.replace(/^\//, ''));
        await fs.unlink(absPath);
      } catch { /* 文件不存在忽略 */ }
    }

    item.hotImagePath = null as any;
    await this.catalogRepo.save(item);

    return { id: catalogId, message: '热门截图已删除，请执行"生成图片指纹"重算pHash' };
  }
}

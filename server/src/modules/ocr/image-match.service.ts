import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { join } from 'path';

/**
 * 图片相似度匹配服务
 * 方案：感知哈希 (pHash) — 无需 GPU / 外部依赖
 *
 * 流程：
 * 1. 上传截图 → 按网格切割为单个装备图标子图
 * 2. 每个子图遮盖角标(五角星/等级/数量)→裁切中心60%（去品质边框）→ 缩放为 32x32 灰度 → DCT → 取低频 8x8 → 生成 64bit 哈希
 * 3. 与参考库所有装备的 imagePhash 比较汉明距离
 * 4. 距离 ≤ 阈值（严格模式19≥70%/宽松模式25≥60%）且与次佳差距 ≥ 3 → 匹配成功
 */
@Injectable()
export class ImageMatchService {
  private readonly logger = new Logger(ImageMatchService.name);

  /** 严格阈值：装备库存页用，汉明距离 ≤ 19/64 即相似度 ≥ 0.70 */
  private static readonly STRICT_HAMMING_THRESHOLD = 19;
  /** 宽松阈值：击杀详情页用，汉明距离 ≤ 25/64 即相似度 ≥ 0.60 */
  private static readonly LOOSE_HAMMING_THRESHOLD = 25;
  /** 歧义差距阈值：最佳 vs 次佳差距 < 3 时判定为歧义匹配，丢弃 */
  private static readonly AMBIGUITY_GAP = 3;

  constructor(
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
    private configService: ConfigService,
  ) {}

  /**
   * 从截图中识别装备图标（图片相似度匹配）
   * @param imageBuffer 上传的截图 Buffer
   * @param options.skipQuantity 跳过数量OCR（击杀详情模式每件=1，避免浪费 OCR 配额）
   * @param options.strict 严格模式（装备库存=true/宽松模式=false，默认宽松）
   * @returns 匹配到的装备列表
   */
  async matchFromScreenshot(imageBuffer: Buffer, options?: { skipQuantity?: boolean; strict?: boolean }): Promise<{
    catalogId: number;
    catalogName: string;
    level: number;
    quality: number;
    category: string;
    gearScore: number;
    confidence: number;
    imageUrl: string | null;
    quantity: number;
  }[]> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      this.logger.error('sharp 模块未安装，图片相似度匹配不可用。请执行: npm install sharp');
      throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖');
    }

    // V2.9.1 分档阈值
    const threshold = options?.strict
      ? ImageMatchService.STRICT_HAMMING_THRESHOLD
      : ImageMatchService.LOOSE_HAMMING_THRESHOLD;
    this.logger.log(`[V2.9.1] 匹配模式: ${options?.strict ? '严格(≥70%)' : '宽松(≥60%)'}, 阈值=${threshold}`);

    // 1. 获取图片尺寸
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    // 2. 按网格切割（装备图标通常为正方形 ~60-80px）
    const iconSize = this.estimateIconSize(width, height);
    const subImages = await this.gridCut(sharp, imageBuffer, width, height, iconSize);
    this.logger.log(`截图 ${width}x${height} 切割为 ${subImages.length} 个子图 (iconSize=${iconSize})`);

    if (subImages.length === 0) {
      // 图片太小，当作单个图标处理
      subImages.push(imageBuffer);
    }

    // 3. 获取参考库所有已有 pHash 的装备
    const catalogs = await this.catalogRepo
      .createQueryBuilder('c')
      .where('c.imagePhash IS NOT NULL')
      .andWhere('c.imagePhash != :empty', { empty: '' })
      .getMany();

    if (catalogs.length === 0) {
      this.logger.warn('参考库中没有已计算 pHash 的装备，请先执行 pHash 生成');
      throw new Error('装备参考库未初始化图片指纹，请在参考库页面执行"生成图片指纹"');
    }

    // 4. 对每个子图计算 pHash 并匹配
    // V2.9.6.1: 取消歧义检验（参考库装备多时gap永远<3导致全丢弃），直接取best结果
    const matches: { subBuf: Buffer; catalog: any; distance: number }[] = [];
    let discardedByThreshold = 0;
    for (const subBuf of subImages) {
      try {
        const cropped = await this.cropCenter(sharp, subBuf, 0.60);
        const hash = await this.computePhash(sharp, cropped);

        // 按装备名分组，同名不同品质取最佳
        const bestByName = new Map<string, { cat: any; distance: number }>();

        for (const cat of catalogs) {
          if (!cat.imagePhash) continue;
          const dist = this.hammingDistance(hash, cat.imagePhash);
          const name = cat.name;
          const existing = bestByName.get(name);
          if (!existing || dist < existing.distance) {
            bestByName.set(name, { cat, distance: dist });
          }
        }

        // 取距离最小的装备名
        const sortedByName = [...bestByName.values()].sort((a, b) => a.distance - b.distance);
        if (sortedByName.length === 0) { discardedByThreshold++; continue; }

        const best = sortedByName[0];

        if (best.distance > threshold) {
          discardedByThreshold++;
          continue;
        }

        // 直接取best，不做歧义丢弃
        matches.push({ subBuf, catalog: best.cat, distance: best.distance });
        this.logger.debug(`[V2.9.6] 匹配成功: dist=${best.distance} name=${best.cat.name}`);
      } catch (err) {
        this.logger.warn(`子图匹配失败: ${err}`);
      }
    }

    this.logger.log(`[V2.9.6] pHash 匹配完成: ${matches.length}/${subImages.length} 子图匹配成功（阈值丢弃${discardedByThreshold}）`);

    // 5. 对匹配成功的子图批量提取数量（并发限制 + 总数上限）
    // 限制数量 OCR 总调用数不超过 MAX_QUANTITY_OCR，避免刷屏和配额消耗
    // F-106.2 击杀详情模式：skipQuantity=true 时每件=1，不做数量 OCR
    const MAX_QUANTITY_OCR = 30;
    const CONCURRENCY = 3;
    const quantitySubImages = options?.skipQuantity ? [] : matches.slice(0, MAX_QUANTITY_OCR);
    const quantityMap = new Map<Buffer, number>();

    if (quantitySubImages.length > 0) {
      this.logger.log(`[F-104] 开始数量OCR: ${quantitySubImages.length} 个子图（上限 ${MAX_QUANTITY_OCR}，并发 ${CONCURRENCY}）`);
      for (let i = 0; i < quantitySubImages.length; i += CONCURRENCY) {
        const batch = quantitySubImages.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (m) => {
          try {
            const qty = await this.extractQuantityFromCorner(sharp, m.subBuf);
            quantityMap.set(m.subBuf, qty);
          } catch {
            quantityMap.set(m.subBuf, 1);
          }
        }));
      }
      this.logger.log(`[F-104] 数量OCR完成: ${quantityMap.size}/${quantitySubImages.length}`);
    } else if (options?.skipQuantity) {
      this.logger.log(`[F-106.2] 击杀详情模式：跳过数量 OCR（每件=1）`);
    }

    // 6. 聚合结果（同 catalogId 合并数量 = 同名+同等级+同品质合并）
    const results: any[] = [];
    for (const m of matches) {
      const qty = quantityMap.get(m.subBuf) ?? 1;
      const confidence = 1 - m.distance / 64;
      const existing = results.find(r => r.catalogId === m.catalog.id);
      if (existing) {
        existing.quantity += qty;
      } else {
        results.push({
          catalogId: m.catalog.id,
          catalogName: m.catalog.name,
          level: m.catalog.level,
          quality: m.catalog.quality,
          category: m.catalog.category,
          gearScore: m.catalog.gearScore,
          confidence: Math.round(confidence * 100) / 100,
          imageUrl: m.catalog.imageUrl,
          quantity: qty,
        });
      }
    }

    this.logger.log(`图片相似度匹配完成: ${results.length}/${subImages.length} 匹配成功，总数量${results.reduce((s, r) => s + r.quantity, 0)}`);
    return results;
  }

  /**
   * 为单个装备图标计算 pHash
   * 优先读取本地文件（localImagePath），fallback 到远程 URL（imageUrl）
   * @param catalogId 参考库ID
   * @param imageUrl 远程图片URL（Albion 渲染图）
   * @param localImagePath 本地图片路径（如 /uploads/catalog/T4_2H_CLAYMORE.png）
   */
  async generatePhashForCatalog(catalogId: number, imageUrl: string, localImagePath?: string | null): Promise<string | null> {
    let sharp: any;
    try { sharp = require('sharp'); } catch { return null; }

    let buffer: Buffer | null = null;

    // 优先读取本地文件
    if (localImagePath) {
      try {
        const absPath = join(process.cwd(), localImagePath.replace(/^\//, ''));
        buffer = await fs.readFile(absPath);
        if (buffer.length === 0) buffer = null;
      } catch {
        // 本地文件不存在或读取失败，继续尝试远程
        buffer = null;
      }
    }

    // fallback 到远程 URL
    if (!buffer && imageUrl && imageUrl.startsWith('http')) {
      try {
        const response = await fetch(imageUrl, {
          headers: { 'User-Agent': 'kook-admin/1.0' },
          signal: AbortSignal.timeout(10000),
        });
        if (response.ok) {
          buffer = Buffer.from(await response.arrayBuffer());
        }
      } catch (err) {
        this.logger.warn(`远程获取图片失败 catalogId=${catalogId}: ${err}`);
      }
    }

    if (!buffer || buffer.length === 0) return null;

    try {
      const cropped = await this.cropCenter(sharp, buffer, 0.60);
      return this.computePhash(sharp, cropped);
    } catch (err) {
      this.logger.warn(`生成 pHash 失败 catalogId=${catalogId}: ${err}`);
      return null;
    }
  }

  /**
   * 批量为所有参考库装备生成 pHash
   * V2.9.6.1: 默认强制重算所有（force=true），修复alpha通道后需刷新全部
   */
  async batchGeneratePhash(force = true): Promise<{ total: number; success: number; failed: number }> {
    const catalogs = await this.catalogRepo.find({
      where: {},
      select: ['id', 'imageUrl', 'imagePhash', 'localImagePath'],
    });

    let success = 0, failed = 0;
    const batchSize = 20;

    for (let i = 0; i < catalogs.length; i += batchSize) {
      const batch = catalogs.slice(i, i + batchSize);
      const promises = batch.map(async (cat) => {
        if (!force && cat.imagePhash) { success++; return; } // 非强制模式：已有则跳过
        if (!cat.imageUrl && !cat.localImagePath) { failed++; return; }

        const hash = await this.generatePhashForCatalog(cat.id, cat.imageUrl, cat.localImagePath);
        if (hash) {
          await this.catalogRepo.update(cat.id, { imagePhash: hash });
          success++;
        } else {
          failed++;
        }
      });
      await Promise.all(promises);

      if ((i + batchSize) % 100 === 0) {
        this.logger.log(`pHash 生成进度: ${i + batchSize}/${catalogs.length}`);
      }
    }

    this.logger.log(`pHash 批量生成完成: 成功 ${success}, 失败 ${failed}, 总计 ${catalogs.length}`);
    return { total: catalogs.length, success, failed };
  }

  /**
   * 从指定区域裁切后识别装备图标（击杀详情左面板用）
   * @param imageBuffer 完整截图 Buffer
   * @param region 裁切区域 { left, top, width, height }
   */
  async matchFromRegion(imageBuffer: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<{
    catalogId: number;
    catalogName: string;
    level: number;
    quality: number;
    category: string;
    gearScore: number;
    confidence: number;
    imageUrl: string | null;
    quantity: number;
  }[]> {
    let sharp: any;
    try { sharp = require('sharp'); } catch {
      throw new Error('图片处理模块未安装');
    }

    // 裁切指定区域
    const regionBuffer = await sharp(imageBuffer)
      .extract({ left: region.left, top: region.top, width: region.width, height: region.height })
      .toBuffer();

    this.logger.log(`裁切击杀详情左面板: left=${region.left}, top=${region.top}, ${region.width}x${region.height}`);

    // 对裁切后的区域执行标准匹配（击杀详情模式：跳过数量 OCR，每件=1）
    return this.matchFromScreenshot(regionBuffer, { skipQuantity: true });
  }

  /**
   * V2.9.7 F-156: 击杀详情左面板固定格子分类匹配
   * 左面板装备格子布局（固定 3列×4行，共10个有效格子）：
   *   行0: [其他(包)] [头]     [披风]
   *   行1: [武器]    [甲]     [副手]
   *   行2: [药水]    [鞋]     [食物]
   *   行3: [坐骑]    [空]     [空]
   * 每个格子只在对应category范围内匹配参考库
   */
  private static readonly KILL_DETAIL_SLOT_MAP: Array<{ row: number; col: number; category: string }> = [
    { row: 0, col: 0, category: '其他' },   // 包
    { row: 0, col: 1, category: '头' },
    { row: 0, col: 2, category: '披风' },
    { row: 1, col: 0, category: '武器' },
    { row: 1, col: 1, category: '甲' },
    { row: 1, col: 2, category: '副手' },
    { row: 2, col: 0, category: '药水' },
    { row: 2, col: 1, category: '鞋' },
    { row: 2, col: 2, category: '食物' },
    { row: 3, col: 0, category: '坐骑' },
  ];

  async matchKillDetailSlots(leftPanelBuffer: Buffer): Promise<{
    catalogId: number;
    catalogName: string;
    level: number;
    quality: number;
    category: string;
    gearScore: number;
    confidence: number;
    imageUrl: string | null;
    quantity: number;
    slotCategory: string;
  }[]> {
    let sharp: any;
    try { sharp = require('sharp'); } catch {
      throw new Error('图片处理模块未安装');
    }

    const metadata = await sharp(leftPanelBuffer).metadata();
    const panelW = metadata.width || 0;
    const panelH = metadata.height || 0;
    if (!panelW || !panelH) throw new Error('无法读取左面板尺寸');

    // 左面板是 3列×4行 的网格，计算每格尺寸
    const cellW = Math.floor(panelW / 3);
    const cellH = Math.floor(panelH / 4);
    // 如果格子太小可能裁切不对，用面板高度/3.5估算（3行半，第4行只有1格）
    const effectiveCellH = Math.min(cellH, Math.floor(panelH / 3.5));
    const effectiveCellW = Math.min(cellW, effectiveCellH * 1.1); // 格子接近正方形

    this.logger.log(`[V2.9.7] 左面板 ${panelW}x${panelH}, 格子 ${effectiveCellW}x${effectiveCellH}`);

    // 加载参考库（带pHash的），按category分组
    const allCatalogs = await this.catalogRepo
      .createQueryBuilder('c')
      .where('c.imagePhash IS NOT NULL')
      .andWhere('c.imagePhash != :empty', { empty: '' })
      .orderBy('c.popularity', 'DESC') // F-158: 热度高的优先
      .getMany();

    if (allCatalogs.length === 0) {
      this.logger.warn('参考库中没有已计算 pHash 的装备');
      return [];
    }

    // 按category分组
    const catalogsByCategory = new Map<string, typeof allCatalogs>();
    for (const cat of allCatalogs) {
      const arr = catalogsByCategory.get(cat.category) || [];
      arr.push(cat);
      catalogsByCategory.set(cat.category, arr);
    }

    const threshold = ImageMatchService.LOOSE_HAMMING_THRESHOLD; // 宽松模式
    const results: any[] = [];

    for (const slot of ImageMatchService.KILL_DETAIL_SLOT_MAP) {
      try {
        // 裁切该格子
        const left = slot.col * effectiveCellW;
        const top = slot.row * effectiveCellH;
        if (left + effectiveCellW > panelW || top + effectiveCellH > panelH) {
          this.logger.debug(`[V2.9.7] 格子(${slot.row},${slot.col}) 越界，跳过`);
          continue;
        }

        const cellBuf = await sharp(leftPanelBuffer)
          .extract({ left, top, width: effectiveCellW, height: effectiveCellH })
          .toBuffer();

        // 过滤空白格子
        const stats = await sharp(cellBuf).stats();
        const avg = stats.channels[0]?.mean || 0;
        if (avg < 15 || avg > 240) {
          this.logger.debug(`[V2.9.7] 格子(${slot.row},${slot.col}) ${slot.category} 空白，跳过`);
          continue;
        }

        // 计算 pHash
        const cropped = await this.cropCenter(sharp, cellBuf, 0.60);
        const hash = await this.computePhash(sharp, cropped);

        // 只在对应 category 内匹配
        let candidateCatalogs = catalogsByCategory.get(slot.category) || [];
        // 副手格也可能是主手（双手武器），所以副手格额外搜索武器分类
        if (slot.category === '副手') {
          const weaponCatalogs = catalogsByCategory.get('武器') || [];
          candidateCatalogs = [...candidateCatalogs, ...weaponCatalogs];
        }

        if (candidateCatalogs.length === 0) {
          this.logger.debug(`[V2.9.7] ${slot.category} 分类无参考库装备，跳过`);
          continue;
        }

        // 按装备名分组取最佳
        const bestByName = new Map<string, { cat: any; distance: number }>();
        for (const cat of candidateCatalogs) {
          if (!cat.imagePhash) continue;
          const dist = this.hammingDistance(hash, cat.imagePhash);
          const name = cat.name;
          const existing = bestByName.get(name);
          if (!existing || dist < existing.distance) {
            bestByName.set(name, { cat, distance: dist });
          }
        }

        const sorted = [...bestByName.values()].sort((a, b) => a.distance - b.distance);
        if (sorted.length === 0) continue;

        const best = sorted[0];
        if (best.distance > threshold) {
          this.logger.debug(`[V2.9.7] 格子(${slot.row},${slot.col}) ${slot.category} best=${best.distance}(${best.cat.name}) 超阈值${threshold}`);
          continue;
        }

        const confidence = Math.round((1 - best.distance / 64) * 100) / 100;
        results.push({
          catalogId: best.cat.id,
          catalogName: best.cat.name,
          level: best.cat.level,
          quality: best.cat.quality,
          category: best.cat.category,
          gearScore: best.cat.gearScore,
          confidence,
          imageUrl: best.cat.imageUrl,
          quantity: 1,
          slotCategory: slot.category,
        });
        this.logger.log(`[V2.9.7] 格子(${slot.row},${slot.col}) ${slot.category} → ${best.cat.name} dist=${best.distance} conf=${confidence}`);
      } catch (err) {
        this.logger.warn(`[V2.9.7] 格子(${slot.row},${slot.col}) 处理失败: ${err}`);
      }
    }

    this.logger.log(`[V2.9.7] 击杀详情分类匹配完成: ${results.length}/10 格子匹配成功`);
    return results;
  }

  // ===== 内部方法 =====

  /**
   * 估算装备图标大小
   * Albion 截图常见尺寸：
   * - 手机截图：宽约 440~700px，图标 70~100px，一行约 5~6 列
   * - PC截图：宽约 800~1920px，图标 60~90px
   */
  /**
   * 估算装备图标大小
   * Albion 截图常见尺寸：
   * - 手机截图：宽约 370~700px，装备栏每行 5~7 列，图标 50~100px
   * - PC截图：宽约 800~1920px，图标 60~90px
   * V2.9.5: 对不同宽度使用更细粒度的列数估算
   */
  private estimateIconSize(imgWidth: number, imgHeight: number): number {
    if (imgWidth <= 120 && imgHeight <= 120) return Math.min(imgWidth, imgHeight);
    if (imgWidth <= 200) return Math.round(imgWidth / 3);
    if (imgWidth <= 400) return Math.round(imgWidth / 5);  // 手机小截图，5列
    if (imgWidth <= 600) return Math.round(imgWidth / 6);  // 中等截图，6列
    if (imgWidth <= 900) return Math.round(imgWidth / 7);  // 大截图，7列
    return Math.round(imgWidth / 8);  // 超宽截图，8列
  }

  /**
   * 智能检测装备网格区域（裁掉顶部/底部/侧边的UI元素）
   * V2.9.5 增强策略：
   *  1. 基于行方差分析 + 连续高方差行块检测
   *  2. 跳过顶部UI区域（标题栏+搜索栏约占15%）和底部UI（底部按钮约占10%）
   *  3. 找到最大的连续高方差行块作为装备网格区域
   * @returns 装备网格的 {left, top, width, height} 区域
   */
  private async detectGridRegion(sharp: any, buffer: Buffer, width: number, height: number): Promise<{ left: number; top: number; width: number; height: number }> {
    try {
      const analyzeW = 200;
      const analyzeH = Math.round((height / width) * analyzeW);
      const { data } = await sharp(buffer)
        .resize(analyzeW, analyzeH)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 计算每一行的方差
      const rowVariances: number[] = [];
      for (let y = 0; y < analyzeH; y++) {
        let sum = 0, sumSq = 0;
        for (let x = 0; x < analyzeW; x++) {
          const v = data[y * analyzeW + x];
          sum += v; sumSq += v * v;
        }
        const mean = sum / analyzeW;
        const variance = sumSq / analyzeW - mean * mean;
        rowVariances.push(variance);
      }

      // V2.9.5: 安全裁剪 — 跳过顶部 12% 和底部 8% 的 UI 区域
      const safeTop = Math.round(analyzeH * 0.12);
      const safeBottom = Math.round(analyzeH * 0.92);

      // 在安全区域内找方差阈值
      const safeVariances = rowVariances.slice(safeTop, safeBottom);
      const sortedVar = [...safeVariances].sort((a, b) => a - b);
      const medianVar = sortedVar[Math.floor(sortedVar.length / 2)];
      const threshold = Math.max(medianVar * 0.4, 200); // 至少200的方差才认为是装备区域

      // 在安全区域内找最大的连续高方差行块
      let bestStart = safeTop, bestEnd = safeBottom;
      let maxBlockLen = 0;
      let curStart = -1;
      for (let y = safeTop; y < safeBottom; y++) {
        if (rowVariances[y] > threshold) {
          if (curStart < 0) curStart = y;
        } else {
          if (curStart >= 0) {
            const blockLen = y - curStart;
            if (blockLen > maxBlockLen) {
              maxBlockLen = blockLen;
              bestStart = curStart;
              bestEnd = y;
            }
            curStart = -1;
          }
        }
      }
      // 处理尾部
      if (curStart >= 0) {
        const blockLen = safeBottom - curStart;
        if (blockLen > maxBlockLen) {
          bestStart = curStart;
          bestEnd = safeBottom;
        }
      }

      // 如果没找到有效块，退化为安全区域
      if (maxBlockLen < 5) {
        bestStart = safeTop;
        bestEnd = safeBottom;
      }

      // 向外扩展 2 行确保不裁到边框
      bestStart = Math.max(0, bestStart - 2);
      bestEnd = Math.min(analyzeH, bestEnd + 2);

      const scale = width / analyzeW;
      const top = Math.max(0, Math.round(bestStart * scale));
      const bottom = Math.min(height, Math.round(bestEnd * scale));

      this.logger.log(`[V2.9.5 detectGridRegion] 安全区域: ${safeTop}~${safeBottom}, 装备块: ${bestStart}~${bestEnd} (方差阈值=${Math.round(threshold)})`);

      return {
        left: 0,
        top,
        width,
        height: Math.max(50, bottom - top),
      };
    } catch (err) {
      this.logger.warn(`装备区域检测失败，使用全图: ${err}`);
      return { left: 0, top: 0, width, height };
    }
  }

  /**
   * 按网格切割图片为子图
   * 自动检测装备区域 + 多候选 iconSize 尝试，选出产生最多有效子图的组合
   */
  private async gridCut(sharp: any, buffer: Buffer, width: number, height: number, iconSize: number): Promise<Buffer[]> {
    // 先检测装备网格区域（裁掉顶部/底部UI）
    const region = await this.detectGridRegion(sharp, buffer, width, height);
    this.logger.log(`装备区域检测: top=${region.top}, height=${region.height} (原图 ${width}x${height})`);

    // 裁切到装备区域
    const regionBuf = (region.top === 0 && region.height === height)
      ? buffer
      : await sharp(buffer).extract(region).toBuffer();
    const regionW = region.width;
    const regionH = region.height;

    // 多候选 iconSize 尝试（当前估算值 ± 两档）
    const candidates = [
      iconSize,
      Math.round(iconSize * 0.85),
      Math.round(iconSize * 1.15),
      Math.round(iconSize * 0.70),
      Math.round(iconSize * 1.30),
    ].filter((s, i, arr) => s >= 40 && s <= 200 && arr.indexOf(s) === i);

    let bestResult: Buffer[] = [];
    let bestCount = 0;

    for (const size of candidates) {
      const subs = await this.gridCutWithSize(sharp, regionBuf, regionW, regionH, size);
      if (subs.length > bestCount) {
        bestCount = subs.length;
        bestResult = subs;
      }
    }

    this.logger.log(`多候选切割完成: 最佳子图数 ${bestCount}`);
    return bestResult;
  }

  /** 用指定 iconSize 切割子图（原 gridCut 逻辑） */
  private async gridCutWithSize(sharp: any, buffer: Buffer, width: number, height: number, iconSize: number): Promise<Buffer[]> {
    const results: Buffer[] = [];
    const cols = Math.floor(width / iconSize);
    const rows = Math.floor(height / iconSize);

    if (cols <= 1 && rows <= 1) return [buffer]; // 单个图标

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        try {
          const left = col * iconSize;
          const top = row * iconSize;
          const sub = await sharp(buffer)
            .extract({ left, top, width: iconSize, height: iconSize })
            .toBuffer();
          // 过滤空白子图（平均亮度极低或极高的跳过）
          const stats = await sharp(sub).stats();
          const avgBrightness = stats.channels[0]?.mean || 0;
          if (avgBrightness > 15 && avgBrightness < 240) {
            results.push(sub);
          }
        } catch { /* 边界越界忽略 */ }
      }
    }
    return results;
  }

  /**
   * 裁切图片中心区域（去品质边框）+ 遮盖四角角标
   * 先将右上角（附魔五角星）、左上角（罗马数字等级）、右下角（数量数字）填黑，
   * 再裁切中心区域，确保参考库图（无角标）和用户截图（有角标）pHash一致。
   */
  private async cropCenter(sharp: any, buffer: Buffer, ratio: number): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;

    // 先遮盖角标区域（用纯黑色块覆盖）
    const masked = await this.maskCorners(sharp, buffer, w, h);

    const cropW = Math.round(w * ratio);
    const cropH = Math.round(h * ratio);
    const left = Math.round((w - cropW) / 2);
    const top = Math.round((h - cropH) / 2);
    return sharp(masked)
      .extract({ left, top, width: cropW, height: cropH })
      .toBuffer();
  }

  /**
   * 遮盖装备图标四角的角标区域（用黑色填充）
   * - 左上角 20%×20%：罗马数字等级
   * - 右上角 20%×20%：附魔五角星
   * - 右下角 25%×25%：数量数字
   */
  private async maskCorners(sharp: any, buffer: Buffer, w: number, h: number): Promise<Buffer> {
    const cornerSize = Math.round(Math.max(w, h) * 0.20);
    const brCornerW = Math.round(w * 0.25);
    const brCornerH = Math.round(h * 0.25);

    // 创建黑色遮盖块
    const blackTL = await sharp({ create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const blackTR = await sharp({ create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const blackBR = await sharp({ create: { width: brCornerW, height: brCornerH, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();

    // V2.9.6.1: flatten先消除alpha通道，确保composite通道一致
    return sharp(buffer)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .composite([
        { input: blackTL, left: 0, top: 0 },
        { input: blackTR, left: w - cornerSize, top: 0 },
        { input: blackBR, left: w - brCornerW, top: h - brCornerH },
      ])
      .toBuffer();
  }

  /**
   * 计算感知哈希 (pHash)
   * 步骤：缩放 32x32 → 灰度 → DCT → 取 8x8 低频 → 中值二值化 → 64bit hex
   */
  private async computePhash(sharp: any, buffer: Buffer): Promise<string> {
    // V2.9.6.1: flatten() 消除 alpha 通道差异（参考库PNG透明图 vs 用户截图JPEG）
    const pixels = await sharp(buffer)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer();

    // 将像素转为 32x32 二维数组
    const matrix: number[][] = [];
    for (let y = 0; y < 32; y++) {
      matrix[y] = [];
      for (let x = 0; x < 32; x++) {
        matrix[y][x] = pixels[y * 32 + x];
      }
    }

    // DCT-II 变换
    const dctMatrix = this.dct2d(matrix, 32);

    // 取左上角 8x8 低频系数（排除 DC 分量 [0][0]）
    const lowFreq: number[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (y === 0 && x === 0) continue; // 排除 DC
        lowFreq.push(dctMatrix[y][x]);
      }
    }

    // 计算中值
    const sorted = [...lowFreq].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];

    // 二值化为 64 bit（含 DC 位设为 0）
    let hash = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (y === 0 && x === 0) { hash += '0'; continue; }
        hash += dctMatrix[y][x] > median ? '1' : '0';
      }
    }

    // 转为 16 字符 hex
    return this.binaryToHex(hash);
  }

  /** 二维 DCT-II 变换 */
  private dct2d(matrix: number[][], N: number): number[][] {
    const result: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

    // 行变换
    const rowDct: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
    for (let y = 0; y < N; y++) {
      for (let u = 0; u < N; u++) {
        let sum = 0;
        for (let x = 0; x < N; x++) {
          sum += matrix[y][x] * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
        }
        rowDct[y][u] = sum;
      }
    }

    // 列变换
    for (let u = 0; u < N; u++) {
      for (let v = 0; v < N; v++) {
        let sum = 0;
        for (let y = 0; y < N; y++) {
          sum += rowDct[y][u] * Math.cos(((2 * y + 1) * v * Math.PI) / (2 * N));
        }
        result[v][u] = sum;
      }
    }

    return result;
  }

  /** 汉明距离（两个 hex 字符串比较） */
  private hammingDistance(hash1: string, hash2: string): number {
    const bin1 = this.hexToBinary(hash1);
    const bin2 = this.hexToBinary(hash2);
    let distance = 0;
    const len = Math.max(bin1.length, bin2.length);
    for (let i = 0; i < len; i++) {
      if ((bin1[i] || '0') !== (bin2[i] || '0')) distance++;
    }
    return distance;
  }

  private binaryToHex(binary: string): string {
    let hex = '';
    for (let i = 0; i < binary.length; i += 4) {
      hex += parseInt(binary.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  }

  private hexToBinary(hex: string): string {
    return hex.split('').map(c => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
  }

  // ===== 右下角数量提取 =====

  /**
   * 从装备子图右下角提取数量数字（V2.9.2 改为 public 供 EquipmentService 调用）
   * 流程：裁切右下角约35%区域 → 放大3倍 → 灰度 → 阈值二值化 → 腾讯云OCR识别数字
   * 识别失败或未识别到数字则返回 1（默认数量）
   */
  async extractQuantityFromCorner(sharp: any, subBuf: Buffer): Promise<number> {
    try {
      const meta = await sharp(subBuf).metadata();
      const w = meta.width || 64;
      const h = meta.height || 64;

      // 子图太小时跳过（如参考库单图），直接返回1
      if (w < 48 || h < 48) return 1;

      // 裁切右下角 35%×35% 区域（数量数字通常在此）
      const cropW = Math.round(w * 0.35);
      const cropH = Math.round(h * 0.35);
      const left = w - cropW;
      const top = h - cropH;

      // 放大3倍 → 灰度 → 线性拉伸提升对比度（数字通常为白色，背景为暗色圆形）
      const processed = await sharp(subBuf)
        .extract({ left, top, width: cropW, height: cropH })
        .resize(cropW * 3, cropH * 3, { kernel: 'lanczos3' })
        .grayscale()
        .linear(1.5, -30) // 提升对比度
        .threshold(180)   // 二值化：亮度>180为白，其余为黑
        .png()
        .toBuffer();

      const base64 = processed.toString('base64');
      const digits = await this.callTencentOcrForDigits(base64);

      if (digits && digits > 0) {
        return digits;
      }
      return 1; // 未识别到数字 → 默认1件
    } catch (err) {
      this.logger.warn(`数量提取失败: ${err}`);
      return 1;
    }
  }

  /**
   * 调用腾讯云 GeneralBasicOCR 识别 Base64 图片中的数字
   * 专用于数量识别：只关心第一个连续数字
   */
  private async callTencentOcrForDigits(base64Data: string): Promise<number | null> {
    const secretId = this.configService.get<string>('tencent.secretId');
    const secretKey = this.configService.get<string>('tencent.secretKey');
    const region = this.configService.get<string>('ocr.region') || 'ap-guangzhou';

    if (!secretId || !secretKey) {
      this.logger.debug('腾讯云 OCR 未配置，跳过数量识别');
      return null;
    }

    try {
      const host = 'ocr.tencentcloudapi.com';
      const service = 'ocr';
      const action = 'GeneralBasicOCR';
      const version = '2018-11-19';
      const timestamp = Math.floor(Date.now() / 1000);
      const date = new Date(timestamp * 1000).toISOString().split('T')[0];

      const payload = JSON.stringify({ ImageBase64: base64Data });
      const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');

      // 签名步骤（与 ocr.service 保持一致）
      const canonicalRequest = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n\ncontent-type;host;x-tc-action\n${hashedPayload}`;
      const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

      const kDate = crypto.createHmac('sha256', `TC3${secretKey}`).update(date).digest();
      const kService = crypto.createHmac('sha256', kDate).update(service).digest();
      const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
      const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

      const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;

      const response = await fetch(`https://${host}`, {
        method: 'POST',
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'Host': host,
          'X-TC-Action': action,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': version,
          'X-TC-Region': region,
        },
        body: payload,
        signal: AbortSignal.timeout(8000),
      });

      const result: any = await response.json();
      if (result.Response?.Error) {
        this.logger.debug(`数量OCR错误: ${result.Response.Error.Message}`);
        return null;
      }

      const detections = result.Response?.TextDetections || [];
      // 合并所有文本，提取第一个数字序列
      const allText = detections.map((d: any) => d.DetectedText || '').join(' ');
      const match = allText.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > 0 && num < 10000) return num; // 合理范围
      }
      return null;
    } catch (err: any) {
      this.logger.debug(`数量OCR调用失败: ${err.message}`);
      return null;
    }
  }

  // ===== V2.9.3 预览匹配（方框级 Top5 候选，供补装识别预览UI用） =====

  /**
   * V2.9.3：预览匹配 — 返回每个方框的 Top N 候选（含切图 base64）
   * 用于补装申请「图像识别预览」UI：原图 + 方框 + Top5 候选 + 勾选确认
   *
   * 与 matchFromScreenshot 的差异：
   *  - 本方法返回每个方框的 Top N 候选（不聚合、不合并、不丢弃歧义）
   *  - 返回每个方框的切图 base64 + 原图坐标（供前端画红框）
   *  - 不做数量 OCR（每件=1，若需要可在前端手动编辑）
   *
   * @param imageBuffer 原图 Buffer
   * @param options.topN 每个方框返回的候选数（默认 5）
   * @param options.autoThreshold 自动勾选的相似度阈值（默认 0.80）
   */
  async previewMatchWithCandidates(
    imageBuffer: Buffer,
    options?: { topN?: number; autoThreshold?: number },
  ): Promise<{
    imgWidth: number;
    imgHeight: number;
    boxes: Array<{
      boxId: string;
      cropBase64: string;
      rect: { left: number; top: number; width: number; height: number };
      candidates: Array<{
        catalogId: number;
        name: string;
        imageUrl: string | null;
        level: number;
        quality: number;
        category: string;
        gearScore: number;
        similarity: number;
        autoChecked: boolean;
      }>;
      selectedCatalogId: number | null;
      checked: boolean;
    }>;
  }> {
    const topN = options?.topN ?? 5;
    const autoThreshold = options?.autoThreshold ?? 0.80;

    let sharp: any;
    try { sharp = require('sharp'); }
    catch { throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖'); }

    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;
    if (!imgWidth || !imgHeight) throw new Error('无法读取图片尺寸');

    // 1. 装备区域检测 + 网格切割（记录坐标）
    const region = await this.detectGridRegion(sharp, imageBuffer, imgWidth, imgHeight);
    const iconSize = this.estimateIconSize(imgWidth, imgHeight);
    const regionBuf = (region.top === 0 && region.height === imgHeight)
      ? imageBuffer
      : await sharp(imageBuffer).extract(region).toBuffer();
    const cols = Math.floor(region.width / iconSize);
    const rows = Math.floor(region.height / iconSize);

    this.logger.log(`[V2.9.3 previewMatch] 区域=${region.width}x${region.height}@(${region.left},${region.top}), iconSize=${iconSize}, 网格=${cols}x${rows}`);

    // 2. 加载参考库
    const catalogs = await this.catalogRepo
      .createQueryBuilder('c')
      .where('c.imagePhash IS NOT NULL')
      .andWhere('c.imagePhash != :empty', { empty: '' })
      .getMany();
    if (catalogs.length === 0) {
      throw new Error('装备参考库未初始化图片指纹，请先执行 "生成图片指纹"');
    }

    const MAX_BOXES = 30;
    const boxes: any[] = [];

    // 3. 遍历每个格子
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (boxes.length >= MAX_BOXES) break;
        try {
          const cellLeft = c * iconSize;
          const cellTop = r * iconSize;
          const subBuf = await sharp(regionBuf)
            .extract({ left: cellLeft, top: cellTop, width: iconSize, height: iconSize })
            .toBuffer();

          // 过滤空白格子
          const stats = await sharp(subBuf).stats();
          const avgBrightness = stats.channels[0]?.mean || 0;
          if (avgBrightness < 15 || avgBrightness > 240) continue;

          // 计算该格 pHash
          const cropped = await this.cropCenter(sharp, subBuf, 0.60);
          const hash = await this.computePhash(sharp, cropped);

          // 与全库比对 → Top N
          const scored = catalogs.map(cat => ({
            cat,
            distance: this.hammingDistance(hash, cat.imagePhash),
          })).sort((a, b) => a.distance - b.distance).slice(0, topN);

          // 生成缩略图 base64（展示用，120x120）
          const thumb = await sharp(subBuf).resize(120, 120, { fit: 'cover' }).png().toBuffer();
          const cropBase64 = `data:image/png;base64,${thumb.toString('base64')}`;

          const candidates = scored.map(s => {
            const sim = 1 - s.distance / 64;
            return {
              catalogId: s.cat.id,
              name: s.cat.name,
              imageUrl: s.cat.imageUrl || null,
              level: s.cat.level,
              quality: s.cat.quality,
              category: s.cat.category,
              gearScore: s.cat.gearScore,
              similarity: Math.round(sim * 100) / 100,
              autoChecked: sim >= autoThreshold,
            };
          });

          const top = candidates[0];
          boxes.push({
            boxId: `r${r}c${c}`,
            cropBase64,
            rect: {
              left: region.left + cellLeft,
              top: region.top + cellTop,
              width: iconSize,
              height: iconSize,
            },
            candidates,
            selectedCatalogId: top && top.autoChecked ? top.catalogId : null,
            checked: !!(top && top.autoChecked),
          });
        } catch (err) {
          this.logger.warn(`[V2.9.3] 方框(${r},${c})处理失败: ${err}`);
        }
      }
      if (boxes.length >= MAX_BOXES) break;
    }

    this.logger.log(`[V2.9.3 previewMatch] 生成 ${boxes.length} 个方框候选（阈值=${autoThreshold}，自动勾选=${boxes.filter(b => b.checked).length}）`);

    return { imgWidth, imgHeight, boxes };
  }

  // ===== V2.9.2 网格识别入库（方案D） =====

  /**
   * 方案D：将截图按网格切成装备子图，每格提取 缩略图+数量+等级(罗马数字)+品质(边框色)
   * 不做装备名匹配——由用户手动填写别名
   * @param imageBuffer 完整截图 Buffer
   * @param options 选项：cols 强制列数，defaultLocation 默认位置
   * @returns 每格的解析结果（按行列顺序）
   */
  async gridParseForManualInput(imageBuffer: Buffer): Promise<{
    gridSize: { cols: number; rows: number };
    cells: Array<{
      row: number;
      col: number;
      thumbnail: string;
      quantity: number;
      detectedLevel: number | null;
      detectedQuality: number | null;
    }>;
  }> {
    let sharp: any;
    try { sharp = require('sharp'); }
    catch { throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖'); }

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    // 检测装备网格区域（裁掉UI）
    const region = await this.detectGridRegion(sharp, imageBuffer, width, height);
    const regionBuf = (region.top === 0 && region.height === height)
      ? imageBuffer
      : await sharp(imageBuffer).extract(region).toBuffer();
    const regionW = region.width;
    const regionH = region.height;

    this.logger.log(`[V2.9.5 gridParse] 装备区域: top=${region.top}, ${regionW}x${regionH}`);

    // V2.9.5: 多候选 iconSize 探索 — 尝试多种格子大小，选出产生最多有效（非空白）格子的尺寸
    const baseIconSize = this.estimateIconSize(width, height);
    const candidateSizes = [
      baseIconSize,
      Math.round(baseIconSize * 0.80),
      Math.round(baseIconSize * 0.90),
      Math.round(baseIconSize * 1.10),
      Math.round(baseIconSize * 1.20),
      Math.round(baseIconSize * 0.70),
      Math.round(baseIconSize * 1.35),
    ].filter((s, i, arr) => s >= 30 && s <= 250 && arr.indexOf(s) === i);

    let bestIconSize = baseIconSize;
    let bestValidCount = 0;
    let bestCols = 0;
    let bestRows = 0;

    for (const size of candidateSizes) {
      const cols = Math.floor(regionW / size);
      const rows = Math.floor(regionH / size);
      if (cols <= 0 || rows <= 0) continue;

      // 快速扫描：统计有效（非空白）格子数
      let validCount = 0;
      for (let r = 0; r < rows && r < 12; r++) {
        for (let c = 0; c < cols && c < 8; c++) {
          try {
            const left = c * size, top = r * size;
            if (left + size > regionW || top + size > regionH) continue;
            const subBuf = await sharp(regionBuf)
              .extract({ left, top, width: size, height: size })
              .toBuffer();
            const stats = await sharp(subBuf).stats();
            const avg = stats.channels[0]?.mean || 0;
            if (avg > 15 && avg < 240) validCount++;
          } catch { /* ignore */ }
        }
      }

      this.logger.debug(`[V2.9.5] iconSize=${size}, cols=${cols}, rows=${rows}, validCells=${validCount}`);
      if (validCount > bestValidCount) {
        bestValidCount = validCount;
        bestIconSize = size;
        bestCols = cols;
        bestRows = rows;
      }
    }

    this.logger.log(`[V2.9.5 gridParse] 最优 iconSize=${bestIconSize}, ${bestCols}x${bestRows}, validCells=${bestValidCount}`);

    const iconSize = bestIconSize;
    const cols = bestCols;
    const rows = bestRows;

    if (cols <= 0 || rows <= 0) {
      // 退化为单图标
      const thumbnail = await sharp(imageBuffer).resize(120, 120, { fit: 'cover' }).png().toBuffer();
      const quantity = await this.extractQuantityFromCorner(sharp, imageBuffer);
      return {
        gridSize: { cols: 1, rows: 1 },
        cells: [{
          row: 0, col: 0,
          thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
          quantity,
          detectedLevel: null,
          detectedQuality: null,
        }],
      };
    }

    const cells: any[] = [];
    const MAX_CELLS = 60;
    const totalCells = cols * rows;
    if (totalCells > MAX_CELLS) {
      this.logger.warn(`[V2.9.5] 网格数 ${totalCells} 超过上限 ${MAX_CELLS}，仅处理前 ${MAX_CELLS} 格`);
    }

    const CONCURRENCY = 3;
    const tasks: Array<() => Promise<void>> = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells.length + tasks.length >= MAX_CELLS) break;
        const row = r, col = c;
        tasks.push(async () => {
          try {
            const left = col * iconSize, top = row * iconSize;
            const subBuf = await sharp(regionBuf)
              .extract({ left, top, width: iconSize, height: iconSize })
              .toBuffer();

            // 过滤纯空白格子（平均亮度过低）
            const stats = await sharp(subBuf).stats();
            const avgBrightness = stats.channels[0]?.mean || 0;
            if (avgBrightness < 15 || avgBrightness > 240) {
              return; // 跳过空白/全白格子
            }

            // 生成 120x120 缩略图 base64
            const thumbnail = await sharp(subBuf)
              .resize(120, 120, { fit: 'cover' })
              .png()
              .toBuffer();

            // 右下角数量OCR
            const quantity = await this.extractQuantityFromCorner(sharp, subBuf);

            // 边框色检测品质
            const detectedQuality = await this.detectQualityFromBorder(sharp, subBuf);

            // 左上角罗马数字（占用配额，仅识别30个以下时启用，暂默认关闭以节省配额）
            // 如需启用：const detectedLevel = await this.detectLevelFromCorner(sharp, subBuf);
            const detectedLevel = null;

            cells.push({
              row, col,
              thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
              quantity,
              detectedLevel,
              detectedQuality,
            });
          } catch (err) {
            this.logger.warn(`[V2.9.2] 格子(${row},${col})解析失败: ${err}`);
          }
        });
      }
    }

    // 分批并发执行
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map(t => t()));
    }

    // 按 row, col 排序返回
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    this.logger.log(`[V2.9.5 gridParse] 解析完成: ${cells.length}/${totalCells} 格有效 (iconSize=${iconSize})`);

    return {
      gridSize: { cols, rows },
      cells,
    };
  }

  /**
   * 检测装备图标的品质边框颜色
   * Albion 品质边框：灰(Q0) / 绿(Q1) / 蓝(Q2) / 紫(Q3) / 金(Q4)
   * 采样四条边中央的像素平均色 → HSV → 映射到品质等级
   */
  private async detectQualityFromBorder(sharp: any, subBuf: Buffer): Promise<number | null> {
    try {
      const meta = await sharp(subBuf).metadata();
      const w = meta.width || 64;
      const h = meta.height || 64;
      if (w < 32 || h < 32) return null;

      // 从图片边缘3~6像素厚度的外圈采样平均颜色
      const borderThickness = Math.max(3, Math.round(Math.min(w, h) * 0.04));

      // 采样上边中央 20%×厚度 的像素
      const { data } = await sharp(subBuf)
        .extract({
          left: Math.round(w * 0.30),
          top: 1,
          width: Math.round(w * 0.40),
          height: borderThickness,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 计算平均 RGB
      let rSum = 0, gSum = 0, bSum = 0;
      const pixelCount = data.length / 3;
      for (let i = 0; i < data.length; i += 3) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
      const r = rSum / pixelCount, g = gSum / pixelCount, b = bSum / pixelCount;

      // RGB → HSV 色相判断
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;
      const lightness = max / 255;

      // 饱和度太低 → 灰色（Q0）
      if (delta < 25 || lightness < 0.3) return 0;

      // 色相判断（0-360度）
      let hue = 0;
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;

      // 色相映射：绿90~150，蓝180~250，紫260~310，金40~60
      if (hue >= 80 && hue <= 160) return 1;  // 绿
      if (hue >= 180 && hue <= 250) return 2; // 蓝
      if (hue >= 260 && hue <= 320) return 3; // 紫
      if (hue >= 30 && hue <= 70 && lightness > 0.5) return 4; // 金/橙
      return 0; // 默认灰
    } catch {
      return null;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { EquipmentImage } from '../equipment-catalog/entities/equipment-image.entity';

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { join } from 'path';

/**
 * 图片相似度匹配服务
 * 方案：感知哈希 (pHash) — 无需 GPU / 外部依赖
 *
 * V2.13 预处理管线：
 * 1. 上传截图 → 按网格切割为单个装备图标子图
 * 2. preprocessForPhash(mode) → 按模式遮罩角标 → 不对称中心裁剪(15%/12%/70%/72%) → 32x32灰度 → normalize
 * 3. computePhashFromRaw → DCT → 8x8低频 → 中值二值化 → 64bit hex
 * 4. 与参考库 imagePhash 比较汉明距离
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
    @InjectRepository(EquipmentCatalog)
    private catalogRepo: Repository<EquipmentCatalog>,
    @InjectRepository(EquipmentImage)
    private imageRepo: Repository<EquipmentImage>,
    private configService: ConfigService,
  ) {}

  /**
   * 从截图中识别装备图标（图片相似度匹配）
   * @param imageBuffer 上传的截图 Buffer
   * @param options.skipQuantity 跳过数量OCR（击杀详情模式每件=1，避免浪费 OCR 配额）
   * @param options.strict 严格模式（装备库存=true/宽松模式=false，默认宽松）
   * @returns 匹配到的装备列表
   */
  async matchFromScreenshot(
    imageBuffer: Buffer,
    options?: {
      skipQuantity?: boolean;
      strict?: boolean;
      hammingThreshold?: number;
    },
  ): Promise<
    {
      catalogId: number;
      catalogName: string;
      level: number;
      quality: number;
      category: string;
      gearScore: number;
      confidence: number;
      imageUrl: string | null;
      quantity: number;
    }[]
  > {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      this.logger.error(
        'sharp 模块未安装，图片相似度匹配不可用。请执行: npm install sharp',
      );
      throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖');
    }

    // V2.9.8: 支持外部传入阈值
    const threshold =
      options?.hammingThreshold ??
      (options?.strict
        ? ImageMatchService.STRICT_HAMMING_THRESHOLD
        : ImageMatchService.LOOSE_HAMMING_THRESHOLD);
    this.logger.log(
      `[V2.9.8] 匹配模式: ${options?.strict ? '严格(≥70%)' : '宽松(≥60%)'}, 阈值=${threshold}`,
    );

    // 1. 获取图片尺寸
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    // 2. 按网格切割（装备图标通常为正方形 ~60-80px）
    const iconSize = this.estimateIconSize(width, height);
    const subImages = await this.gridCut(
      sharp,
      imageBuffer,
      width,
      height,
      iconSize,
    );
    this.logger.log(
      `截图 ${width}x${height} 切割为 ${subImages.length} 个子图 (iconSize=${iconSize})`,
    );

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
      throw new Error(
        '装备参考库未初始化图片指纹，请在参考库页面执行"生成图片指纹"',
      );
    }

    // 4. 对每个子图计算 pHash 并匹配
    // V2.9.6.1: 取消歧义检验（参考库装备多时gap永远<3导致全丢弃），直接取best结果
    const matches: { subBuf: Buffer; catalog: any; distance: number }[] = [];
    let discardedByThreshold = 0;
    for (const subBuf of subImages) {
      try {
        // V2.13: inventory 模式 — 仅遮罩右下角，不对称中心裁剪，normalize
        const rawPixels = await this.preprocessForPhash(sharp, subBuf, 'inventory');
        const hash = this.computePhashFromRaw(rawPixels);

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
        const sortedByName = [...bestByName.values()].sort(
          (a, b) => a.distance - b.distance,
        );
        if (sortedByName.length === 0) {
          discardedByThreshold++;
          continue;
        }

        const best = sortedByName[0];

        if (best.distance > threshold) {
          discardedByThreshold++;
          continue;
        }

        // 直接取best，不做歧义丢弃
        matches.push({ subBuf, catalog: best.cat, distance: best.distance });
        this.logger.debug(
          `[V2.9.6] 匹配成功: dist=${best.distance} name=${best.cat.name}`,
        );
      } catch (err) {
        this.logger.warn(`子图匹配失败: ${err}`);
      }
    }

    this.logger.log(
      `[V2.9.6] pHash 匹配完成: ${matches.length}/${subImages.length} 子图匹配成功（阈值丢弃${discardedByThreshold}）`,
    );

    // 5. 对匹配成功的子图批量提取数量（并发限制 + 总数上限）
    // 限制数量 OCR 总调用数不超过 MAX_QUANTITY_OCR，避免刷屏和配额消耗
    // F-106.2 击杀详情模式：skipQuantity=true 时每件=1，不做数量 OCR
    const MAX_QUANTITY_OCR = 30;
    const CONCURRENCY = 3;
    const quantitySubImages = options?.skipQuantity
      ? []
      : matches.slice(0, MAX_QUANTITY_OCR);
    const quantityMap = new Map<Buffer, number>();

    if (quantitySubImages.length > 0) {
      this.logger.log(
        `[F-104] 开始数量OCR: ${quantitySubImages.length} 个子图（上限 ${MAX_QUANTITY_OCR}，并发 ${CONCURRENCY}）`,
      );
      for (let i = 0; i < quantitySubImages.length; i += CONCURRENCY) {
        const batch = quantitySubImages.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (m) => {
            try {
              const qty = await this.extractQuantityFromCorner(sharp, m.subBuf);
              quantityMap.set(m.subBuf, qty);
            } catch {
              quantityMap.set(m.subBuf, 1);
            }
          }),
        );
      }
      this.logger.log(
        `[F-104] 数量OCR完成: ${quantityMap.size}/${quantitySubImages.length}`,
      );
    } else if (options?.skipQuantity) {
      this.logger.log(`[F-106.2] 击杀详情模式：跳过数量 OCR（每件=1）`);
    }

    // 6. 聚合结果（同 catalogId 合并数量 = 同名+同等级+同品质合并）
    const results: any[] = [];
    for (const m of matches) {
      const qty = quantityMap.get(m.subBuf) ?? 1;
      const confidence = 1 - m.distance / 64;
      const existing = results.find((r) => r.catalogId === m.catalog.id);
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

    this.logger.log(
      `图片相似度匹配完成: ${results.length}/${subImages.length} 匹配成功，总数量${results.reduce((s, r) => s + r.quantity, 0)}`,
    );
    return results;
  }

  /**
   * 为单个装备图标计算 pHash
   * V2.9.8: 优先级 hotImagePath（热门装备游戏截图）> localImagePath > imageUrl（远程）
   * @param catalogId 参考库ID
   * @param imageUrl 远程图片URL（Albion 渲染图）
   * @param localImagePath 本地图片路径（如 /uploads/catalog/T4_2H_CLAYMORE.png）
   * @param hotImagePath 热门装备游戏截图路径
   */
  async generatePhashForCatalog(
    catalogId: number,
    imageUrl: string,
    localImagePath?: string | null,
    hotImagePath?: string | null,
  ): Promise<string | null> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      return null;
    }

    let buffer: Buffer | null = null;

    // V2.9.8: 优先读热门装备截图
    if (hotImagePath) {
      try {
        const absPath = join(process.cwd(), hotImagePath.replace(/^\//, ''));
        buffer = await fs.readFile(absPath);
        if (buffer.length === 0) buffer = null;
        else
          this.logger.debug(`[V2.9.8] pHash使用hotImagePath: ${hotImagePath}`);
      } catch {
        buffer = null;
      }
    }

    // 其次读本地文件
    if (!buffer && localImagePath) {
      try {
        const absPath = join(process.cwd(), localImagePath.replace(/^\//, ''));
        buffer = await fs.readFile(absPath);
        if (buffer.length === 0) buffer = null;
      } catch {
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
      // V2.13: catalog 模式 — 不遮罩，不对称中心裁剪，normalize
      const rawPixels = await this.preprocessForPhash(sharp, buffer, 'catalog');
      return this.computePhashFromRaw(rawPixels);
    } catch (err) {
      this.logger.warn(`生成 pHash 失败 catalogId=${catalogId}: ${err}`);
      return null;
    }
  }

  /**
   * 批量为所有参考库装备生成 pHash
   * V2.9.6.1: 默认强制重算所有（force=true），修复alpha通道后需刷新全部
   */
  async batchGeneratePhash(
    force = true,
  ): Promise<{ total: number; success: number; failed: number }> {
    const catalogs = await this.catalogRepo.find({
      where: {},
      select: [
        'id',
        'imageUrl',
        'imagePhash',
        'localImagePath',
        'hotImagePath',
      ],
    });

    let success = 0,
      failed = 0;
    const batchSize = 20;

    for (let i = 0; i < catalogs.length; i += batchSize) {
      const batch = catalogs.slice(i, i + batchSize);
      const promises = batch.map(async (cat) => {
        if (!force && cat.imagePhash) {
          success++;
          return;
        } // 非强制模式：已有则跳过
        if (!cat.imageUrl && !cat.localImagePath && !cat.hotImagePath) {
          failed++;
          return;
        }

        const hash = await this.generatePhashForCatalog(
          cat.id,
          cat.imageUrl,
          cat.localImagePath,
          cat.hotImagePath,
        );
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

    this.logger.log(
      `pHash 批量生成完成: 成功 ${success}, 失败 ${failed}, 总计 ${catalogs.length}`,
    );
    return { total: catalogs.length, success, failed };
  }

  /**
   * 从指定区域裁切后识别装备图标（击杀详情左面板用）
   * @param imageBuffer 完整截图 Buffer
   * @param region 裁切区域 { left, top, width, height }
   */
  async matchFromRegion(
    imageBuffer: Buffer,
    region: { left: number; top: number; width: number; height: number },
  ): Promise<
    {
      catalogId: number;
      catalogName: string;
      level: number;
      quality: number;
      category: string;
      gearScore: number;
      confidence: number;
      imageUrl: string | null;
      quantity: number;
    }[]
  > {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装');
    }

    // 裁切指定区域
    const regionBuffer = await sharp(imageBuffer)
      .extract({
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      })
      .toBuffer();

    this.logger.log(
      `裁切击杀详情左面板: left=${region.left}, top=${region.top}, ${region.width}x${region.height}`,
    );

    // 对裁切后的区域执行标准匹配（击杀详情模式：跳过数量 OCR，每件=1）
    return this.matchFromScreenshot(regionBuffer, { skipQuantity: true });
  }

  /**
   * V2.9.9: 击杀详情左面板固定格子分类匹配
   * 使用精确的百分比坐标定位每个装备格子中心（基于游戏UI固定比例测量）
   * 左面板装备格子布局（10个有效格子）：
   *   行0: [其他(包)] [头]     [披风]
   *   行1: [武器]    [甲]     [副手]
   *   行2: [药水]    [鞋]     [食物]
   *   行3: [空]      [坐骑]   [空]
   */
  private static readonly KILL_DETAIL_SLOT_MAP: Array<{
    cx: number;
    cy: number;
    category: string;
    label: string;
  }> = [
    // V2.12.4: 5张截图验证后的固值比例（cx,cy 为格子中心相对装备区的百分比）
    { cx: 0.120, cy: 0.140, category: '其他', label: '包' },
    { cx: 0.500, cy: 0.095, category: '头', label: '头盔' },
    { cx: 0.895, cy: 0.105, category: '披风', label: '披风' },
    { cx: 0.135, cy: 0.415, category: '武器', label: '武器' },
    { cx: 0.500, cy: 0.400, category: '甲', label: '胸甲' },
    { cx: 0.895, cy: 0.400, category: '副手', label: '副手' },
    { cx: 0.135, cy: 0.685, category: '药水', label: '药水' },
    { cx: 0.500, cy: 0.685, category: '鞋', label: '鞋子' },
    { cx: 0.895, cy: 0.670, category: '食物', label: '食物' },
    { cx: 0.500, cy: 0.920, category: '坐骑', label: '坐骑' },
  ];

  async matchKillDetailSlots(
    leftPanelBuffer: Buffer,
    hammingThreshold?: number,
  ): Promise<
    {
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
    }[]
  > {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装');
    }

    const metadata = await sharp(leftPanelBuffer).metadata();
    const panelW = metadata.width || 0;
    const panelH = metadata.height || 0;
    if (!panelW || !panelH) throw new Error('无法读取左面板尺寸');

    // V2.9.9: 基于百分比坐标切图（每格约 28%W x 22%H）
    const cellWRatio = 0.28;
    const cellHRatio = 0.22;
    const cellW = Math.floor(panelW * cellWRatio);
    const cellH = Math.floor(panelH * cellHRatio);

    this.logger.log(
      `[V2.9.9] 左面板 ${panelW}x${panelH}, 格子 ${cellW}x${cellH} (百分比切图)`,
    );

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

    const threshold =
      hammingThreshold ?? ImageMatchService.LOOSE_HAMMING_THRESHOLD;
    this.logger.log(`[V2.9.8] 击杀详情匹配阈值: ${threshold}`);
    const results: any[] = [];

    for (const slot of ImageMatchService.KILL_DETAIL_SLOT_MAP) {
      try {
        // V2.9.9: 基于百分比中心坐标裁切格子
        const centerX = Math.round(panelW * slot.cx);
        const centerY = Math.round(panelH * slot.cy);
        const left = Math.max(0, centerX - Math.floor(cellW / 2));
        const top = Math.max(0, centerY - Math.floor(cellH / 2));
        const actualW = Math.min(cellW, panelW - left);
        const actualH = Math.min(cellH, panelH - top);
        if (actualW < 20 || actualH < 20) {
          this.logger.debug(`[V2.9.9] 格子 ${slot.label} 尺寸过小，跳过`);
          continue;
        }

        const cellBuf = await sharp(leftPanelBuffer)
          .extract({ left, top, width: actualW, height: actualH })
          .toBuffer();

        // V2.9.8: 增强空白格子检测（亮度+方差双重检测）
        const stats = await sharp(cellBuf).stats();
        const avg = stats.channels[0]?.mean || 0;
        const stdDev = stats.channels[0]?.stdev || 0;
        // 空格子特征：亮度在150-210之间（米色背景）且方差很低（<25，颜色均匀）
        const isEmptyByBrightness = avg < 15 || avg > 240;
        const isEmptyByVariance = avg > 140 && avg < 220 && stdDev < 25;
        if (isEmptyByBrightness || isEmptyByVariance) {
          this.logger.debug(
            `[V2.9.9] 格子 ${slot.label} 空白(avg=${avg.toFixed(0)},std=${stdDev.toFixed(1)})，跳过`,
          );
          continue;
        }

        // V2.13: resupply 模式 — 仅遮罩右上角，不对称中心裁剪，normalize
        const rawPixels = await this.preprocessForPhash(sharp, cellBuf, 'resupply');
        const hash = this.computePhashFromRaw(rawPixels);

        // 只在对应 category 内匹配
        let candidateCatalogs = catalogsByCategory.get(slot.category) || [];
        // 副手格也可能是主手（双手武器），所以副手格额外搜索武器分类
        if (slot.category === '副手') {
          const weaponCatalogs = catalogsByCategory.get('武器') || [];
          candidateCatalogs = [...candidateCatalogs, ...weaponCatalogs];
        }

        if (candidateCatalogs.length === 0) {
          this.logger.debug(
            `[V2.9.9] ${slot.label}(${slot.category}) 分类无参考库装备，跳过`,
          );
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

        const sorted = [...bestByName.values()].sort(
          (a, b) => a.distance - b.distance,
        );
        if (sorted.length === 0) continue;

        const best = sorted[0];
        if (best.distance > threshold) {
          this.logger.debug(
            `[V2.9.9] 格子 ${slot.label} best=${best.distance}(${best.cat.name}) 超阈值${threshold}`,
          );
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
        this.logger.log(
          `[V2.9.9] 格子 ${slot.label} → ${best.cat.name} dist=${best.distance} conf=${confidence}`,
        );
      } catch (err) {
        this.logger.warn(`[V2.9.9] 格子 ${slot.label} 处理失败: ${err}`);
      }
    }

    this.logger.log(
      `[V2.9.9] 击杀详情百分比切图匹配完成: ${results.length}/10 格子匹配成功`,
    );
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
    if (imgWidth <= 120 && imgHeight <= 120)
      return Math.min(imgWidth, imgHeight);
    if (imgWidth <= 200) return Math.round(imgWidth / 3);
    if (imgWidth <= 400) return Math.round(imgWidth / 5); // 手机小截图，5列
    if (imgWidth <= 600) return Math.round(imgWidth / 6); // 中等截图，6列
    if (imgWidth <= 900) return Math.round(imgWidth / 7); // 大截图，7列
    return Math.round(imgWidth / 8); // 超宽截图，8列
  }

  /**
   * 智能检测装备网格区域（裁掉顶部/底部/侧边的UI元素）
   * V2.9.5 增强策略：
   *  1. 基于行方差分析 + 连续高方差行块检测
   *  2. 跳过顶部UI区域（标题栏+搜索栏约占15%）和底部UI（底部按钮约占10%）
   *  3. 找到最大的连续高方差行块作为装备网格区域
   * @returns 装备网格的 {left, top, width, height} 区域
   */
  private async detectGridRegion(
    sharp: any,
    buffer: Buffer,
    width: number,
    height: number,
  ): Promise<{ left: number; top: number; width: number; height: number }> {
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
        let sum = 0,
          sumSq = 0;
        for (let x = 0; x < analyzeW; x++) {
          const v = data[y * analyzeW + x];
          sum += v;
          sumSq += v * v;
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
      let bestStart = safeTop,
        bestEnd = safeBottom;
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

      this.logger.log(
        `[V2.9.5 detectGridRegion] 安全区域: ${safeTop}~${safeBottom}, 装备块: ${bestStart}~${bestEnd} (方差阈值=${Math.round(threshold)})`,
      );

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
  private async gridCut(
    sharp: any,
    buffer: Buffer,
    width: number,
    height: number,
    iconSize: number,
  ): Promise<Buffer[]> {
    // 先检测装备网格区域（裁掉顶部/底部UI）
    const region = await this.detectGridRegion(sharp, buffer, width, height);
    this.logger.log(
      `装备区域检测: top=${region.top}, height=${region.height} (原图 ${width}x${height})`,
    );

    // 裁切到装备区域
    const regionBuf =
      region.top === 0 && region.height === height
        ? buffer
        : await sharp(buffer).extract(region).toBuffer();
    const regionW = region.width;
    const regionH = region.height;

    // 多候选 iconSize 尝试（当前估算值 ± 两档）
    const candidates = [
      iconSize,
      Math.round(iconSize * 0.85),
      Math.round(iconSize * 1.15),
      Math.round(iconSize * 0.7),
      Math.round(iconSize * 1.3),
    ].filter((s, i, arr) => s >= 40 && s <= 200 && arr.indexOf(s) === i);

    let bestResult: Buffer[] = [];
    let bestCount = 0;

    for (const size of candidates) {
      const subs = await this.gridCutWithSize(
        sharp,
        regionBuf,
        regionW,
        regionH,
        size,
      );
      if (subs.length > bestCount) {
        bestCount = subs.length;
        bestResult = subs;
      }
    }

    this.logger.log(`多候选切割完成: 最佳子图数 ${bestCount}`);
    return bestResult;
  }

  /** 用指定 iconSize 切割子图（原 gridCut 逻辑） */
  private async gridCutWithSize(
    sharp: any,
    buffer: Buffer,
    width: number,
    height: number,
    iconSize: number,
  ): Promise<Buffer[]> {
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
        } catch {
          /* 边界越界忽略 */
        }
      }
    }
    return results;
  }

  // ===== V2.13: 统一预处理管线 =====

  /** 灰128背景色，用于 flatten 和遮罩，减少与截图背景的灰度差异 */
  private static readonly GRAY_BG = { r: 128, g: 128, b: 128 };

  /** 不对称中心裁剪参数（偏上裁剪，避开底部数量区和顶部边框） */
  private static readonly CROP_X = 0.15;   // 左侧去15%
  private static readonly CROP_Y = 0.12;   // 顶部去12%
  private static readonly CROP_W = 0.70;   // 保留宽度70%
  private static readonly CROP_H = 0.72;   // 保留高度72%

  /**
   * V2.13.2: 统一预处理管线 — 遮罩→不对称中心裁剪→均衡化（不旋转）
   * 旋转45°在实测中对识别精度提升不明显且引入额外形变，回退为纯裁剪方案
   * @param mode 'catalog'(参考库渲染图) | 'inventory'(库存截图) | 'resupply'(补装截图)
   * @returns 预处理后的 32×32 灰度 raw Buffer，可直接计算 pHash
   */
  private async preprocessForPhash(
    sharp: any,
    buffer: Buffer,
    mode: 'catalog' | 'inventory' | 'resupply',
  ): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;

    // Step 1: flatten — 统一背景灰128，消除 alpha 通道
    let processed = await sharp(buffer)
      .flatten({ background: ImageMatchService.GRAY_BG })
      .toBuffer();

    // Step 2: 按模式遮罩不同角标（灰128填充，避免 DCT 低频跳变）
    const composites: any[] = [];

    if (mode === 'inventory') {
      // 库存模式：仅遮罩右下角25%（堆叠数量数字，渲染图没有）
      const brW = Math.round(w * 0.25);
      const brH = Math.round(h * 0.25);
      const brMask = await sharp({
        create: { width: brW, height: brH, channels: 3, background: ImageMatchService.GRAY_BG },
      }).png().toBuffer();
      composites.push({ input: brMask, left: w - brW, top: h - brH });
    } else if (mode === 'resupply') {
      // 补装模式：仅遮罩右上角20%（附魔星标，渲染图没有）
      const trSize = Math.round(Math.max(w, h) * 0.20);
      const trMask = await sharp({
        create: { width: trSize, height: trSize, channels: 3, background: ImageMatchService.GRAY_BG },
      }).png().toBuffer();
      composites.push({ input: trMask, left: w - trSize, top: 0 });
    }
    // catalog 模式：不遮罩任何角标（渲染图自带左上等级+左下品质，与截图一致）

    if (composites.length > 0) {
      processed = await sharp(processed).composite(composites).toBuffer();
    }

    // Step 3: 不对称中心裁剪（偏上裁剪，去边框+角标残余）
    const cropLeft = Math.round(w * ImageMatchService.CROP_X);
    const cropTop = Math.round(h * ImageMatchService.CROP_Y);
    const cropW = Math.round(w * ImageMatchService.CROP_W);
    const cropH = Math.round(h * ImageMatchService.CROP_H);

    // Step 4: 裁剪 → 32×32 → 灰度 → normalize(直方图均衡化) → raw
    return sharp(processed)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .normalize()
      .raw()
      .toBuffer();
  }

  /**
   * V2.13: 从预处理后的 32×32 raw buffer 直接计算 pHash
   * （preprocessForPhash 已完成 flatten/遮罩/裁剪/resize/灰度/normalize）
   */
  private computePhashFromRaw(rawPixels: Buffer): string {
    const matrix: number[][] = [];
    for (let y = 0; y < 32; y++) {
      matrix[y] = [];
      for (let x = 0; x < 32; x++) {
        matrix[y][x] = rawPixels[y * 32 + x];
      }
    }
    const dctMatrix = this.dct2d(matrix, 32);
    const lowFreq: number[] = [];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (y === 0 && x === 0) continue;
        lowFreq.push(dctMatrix[y][x]);
      }
    }
    const sorted = [...lowFreq].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    let hash = '';
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (y === 0 && x === 0) { hash += '0'; continue; }
        hash += dctMatrix[y][x] > median ? '1' : '0';
      }
    }
    return this.binaryToHex(hash);
  }

  // ===== V2.13: 保留旧方法向后兼容（deprecated，仅供未迁移的调用点使用） =====

  /** @deprecated V2.13 — 使用 preprocessForPhash + computePhashFromRaw 替代 */
  private async cropCenter(
    sharp: any,
    buffer: Buffer,
    ratio: number,
  ): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;
    const masked = await this.maskCorners(sharp, buffer, w, h);
    const cropW = Math.round(w * ratio);
    const cropH = Math.round(h * ratio);
    const left = Math.round((w - cropW) / 2);
    const top = Math.round((h - cropH) / 2);
    return sharp(masked)
      .extract({ left, top, width: cropW, height: cropH })
      .toBuffer();
  }

  /** @deprecated V2.13 — 使用 preprocessForPhash 替代 */
  private async maskCorners(
    sharp: any,
    buffer: Buffer,
    w: number,
    h: number,
  ): Promise<Buffer> {
    const cornerSize = Math.round(Math.max(w, h) * 0.2);
    const brCornerW = Math.round(w * 0.25);
    const brCornerH = Math.round(h * 0.25);
    const blackTL = await sharp({
      create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    const blackTR = await sharp({
      create: { width: cornerSize, height: cornerSize, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    const blackBR = await sharp({
      create: { width: brCornerW, height: brCornerH, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();
    return sharp(buffer)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .composite([
        { input: blackTL, left: 0, top: 0 },
        { input: blackTR, left: w - cornerSize, top: 0 },
        { input: blackBR, left: w - brCornerW, top: h - brCornerH },
      ])
      .toBuffer();
  }

  /** @deprecated V2.13 — 使用 preprocessForPhash + computePhashFromRaw 替代 */
  private async computePhash(sharp: any, buffer: Buffer): Promise<string> {
    const pixels = await sharp(buffer)
      .flatten({ background: { r: 128, g: 128, b: 128 } })
      .resize(32, 32, { fit: 'fill' })
      .grayscale()
      .normalize()
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
        if (y === 0 && x === 0) {
          hash += '0';
          continue;
        }
        hash += dctMatrix[y][x] > median ? '1' : '0';
      }
    }

    // 转为 16 字符 hex
    return this.binaryToHex(hash);
  }

  /** 二维 DCT-II 变换 */
  private dct2d(matrix: number[][], N: number): number[][] {
    const result: number[][] = Array.from({ length: N }, () =>
      new Array(N).fill(0),
    );

    // 行变换
    const rowDct: number[][] = Array.from({ length: N }, () =>
      new Array(N).fill(0),
    );
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
    return hex
      .split('')
      .map((c) => parseInt(c, 16).toString(2).padStart(4, '0'))
      .join('');
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
        .threshold(180) // 二值化：亮度>180为白，其余为黑
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
  private async callTencentOcrForDigits(
    base64Data: string,
  ): Promise<number | null> {
    const secretId = this.configService.get<string>('tencent.secretId');
    const secretKey = this.configService.get<string>('tencent.secretKey');
    const region =
      this.configService.get<string>('ocr.region') || 'ap-guangzhou';

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
      const hashedPayload = crypto
        .createHash('sha256')
        .update(payload)
        .digest('hex');

      // 签名步骤（与 ocr.service 保持一致）
      const canonicalRequest = `POST\n/\n\ncontent-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n\ncontent-type;host;x-tc-action\n${hashedPayload}`;
      const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${date}/${service}/tc3_request\n${crypto.createHash('sha256').update(canonicalRequest).digest('hex')}`;

      const kDate = crypto
        .createHmac('sha256', `TC3${secretKey}`)
        .update(date)
        .digest();
      const kService = crypto
        .createHmac('sha256', kDate)
        .update(service)
        .digest();
      const kSigning = crypto
        .createHmac('sha256', kService)
        .update('tc3_request')
        .digest();
      const signature = crypto
        .createHmac('sha256', kSigning)
        .update(stringToSign)
        .digest('hex');

      const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${date}/${service}/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;

      const response = await fetch(`https://${host}`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          Host: host,
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
      const allText = detections
        .map((d: any) => d.DetectedText || '')
        .join(' ');
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
   * @param options.hammingThreshold 汉明距离阈值（可调，默认25）
   */
  async previewMatchWithCandidates(
    imageBuffer: Buffer,
    options?: {
      topN?: number;
      autoThreshold?: number;
      hammingThreshold?: number;
    },
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
    const autoThreshold = options?.autoThreshold ?? 0.8;

    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;
    if (!imgWidth || !imgHeight) throw new Error('无法读取图片尺寸');

    // 1. 装备区域检测 + 网格切割（记录坐标）
    const region = await this.detectGridRegion(
      sharp,
      imageBuffer,
      imgWidth,
      imgHeight,
    );
    const iconSize = this.estimateIconSize(imgWidth, imgHeight);
    const regionBuf =
      region.top === 0 && region.height === imgHeight
        ? imageBuffer
        : await sharp(imageBuffer).extract(region).toBuffer();
    const cols = Math.floor(region.width / iconSize);
    const rows = Math.floor(region.height / iconSize);

    this.logger.log(
      `[V2.9.3 previewMatch] 区域=${region.width}x${region.height}@(${region.left},${region.top}), iconSize=${iconSize}, 网格=${cols}x${rows}`,
    );

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
            .extract({
              left: cellLeft,
              top: cellTop,
              width: iconSize,
              height: iconSize,
            })
            .toBuffer();

          // 过滤空白格子
          const stats = await sharp(subBuf).stats();
          const avgBrightness = stats.channels[0]?.mean || 0;
          if (avgBrightness < 15 || avgBrightness > 240) continue;

          // V2.13: inventory 模式预处理
          const rawPixels = await this.preprocessForPhash(sharp, subBuf, 'inventory');
          const hash = this.computePhashFromRaw(rawPixels);

          // 与全库比对 → Top N
          const scored = catalogs
            .map((cat) => ({
              cat,
              distance: this.hammingDistance(hash, cat.imagePhash),
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, topN);

          // 生成缩略图 base64（展示用，120x120）
          const thumb = await sharp(subBuf)
            .resize(120, 120, { fit: 'cover' })
            .png()
            .toBuffer();
          const cropBase64 = `data:image/png;base64,${thumb.toString('base64')}`;

          const candidates = scored.map((s) => {
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

    this.logger.log(
      `[V2.9.3 previewMatch] 生成 ${boxes.length} 个方框候选（阈值=${autoThreshold}，自动勾选=${boxes.filter((b) => b.checked).length}）`,
    );

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
  /**
   * V2.10.6: 3框定位法 — 用户标定3个格子(R1C1, R1C2, R2C1)精确计算步进
   */
  async gridParseWith3Boxes(
    imageBuffer: Buffer,
    layout: string,
    boxes: Array<{ x: number; y: number; w: number; h: number }>,
  ): Promise<{
    gridSize: { cols: number; rows: number };
    cells: Array<{
      row: number;
      col: number;
      thumbnail: string;
      quantity: number;
      detectedLevel: number | null;
      detectedQuality: number | null;
      matchedName?: string;
      matchedCatalogId?: number;
      matchedConfidence?: number;
    }>;
  }> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    let cols = 5,
      rows = 7;
    const parts = layout.split('x').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      cols = parts[0];
      rows = parts[1];
    }

    const [box1, box2, box3] = boxes; // R1C1, R1C2, R2C1

    // 格子宽高：3框取平均（修正手抖）
    const cellW = Math.round((box1.w + box2.w + box3.w) / 3);
    const cellH = Math.round((box1.h + box2.h + box3.h) / 3);

    // 列步进 = R1C2中心x - R1C1中心x
    const box1CenterX = box1.x + box1.w / 2;
    const box1CenterY = box1.y + box1.h / 2;
    const box2CenterX = box2.x + box2.w / 2;
    const box3CenterY = box3.y + box3.h / 2;

    const colStep = Math.round(box2CenterX - box1CenterX);
    const rowStep = Math.round(box3CenterY - box1CenterY);

    // 间隙
    const colGap = colStep - cellW;
    const rowGap = rowStep - cellH;

    // 起始点：第一格左上角
    const startX = box1.x;
    const startY = box1.y;

    this.logger.log(
      `[V2.10.6 3boxes] cellW=${cellW}, cellH=${cellH}, colStep=${colStep}(gap=${colGap}), rowStep=${rowStep}(gap=${rowGap}), start=(${startX},${startY}), layout=${cols}x${rows}`,
    );

    const cells: any[] = [];
    const CONCURRENCY = 3;
    const tasks: Array<() => Promise<void>> = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tasks.push(async () => {
          try {
            const left = Math.round(startX + c * colStep);
            const top = Math.round(startY + r * rowStep);

            if (
              left < 0 ||
              top < 0 ||
              left + cellW > width ||
              top + cellH > height
            )
              return;

            const subBuf = await sharp(imageBuffer)
              .extract({ left, top, width: cellW, height: cellH })
              .toBuffer();

            // 过滤空白格子
            const stats = await sharp(subBuf).stats();
            const avg = stats.channels[0]?.mean || 0;
            const std = stats.channels[0]?.stdev || 0;
            if (avg < 15 || avg > 240) return;
            if (avg > 140 && avg < 220 && std < 25) return;

            const thumbnail = await sharp(subBuf)
              .resize(120, 120, { fit: 'cover' })
              .png()
              .toBuffer();
            const quantity = await this.extractQuantityFromCorner(
              sharp,
              subBuf,
            );
            const detectedQuality = await this.detectQualityFromBorder(
              sharp,
              subBuf,
            );

            cells.push({
              row: r,
              col: c,
              thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
              quantity,
              detectedLevel: null,
              detectedQuality,
            });
          } catch {
            /* skip */
          }
        });
      }
    }

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((t) => t()));
    }

    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    this.logger.log(
      `[V2.10.6 3boxes] 切图完成: ${cells.length}/${cols * rows} 格有效`,
    );

    await this.prefillGridCellsByLayeredPhash(sharp, cells);

    // Layer 4: 数量识别 — 裁右下角28%区域放大后重新识别
    for (const cell of cells) {
      try {
        const thumbBase64 = cell.thumbnail.replace(
          /^data:image\/\w+;base64,/,
          '',
        );
        const thumbBuf = Buffer.from(thumbBase64, 'base64');
        const thumbMeta = await sharp(thumbBuf).metadata();
        const tw = thumbMeta.width || 120;
        const th = thumbMeta.height || 120;
        const roiW = Math.round(tw * 0.32);
        const roiH = Math.round(th * 0.28);
        const roiX = tw - roiW;
        const roiY = th - roiH;
        const roiBuf = await sharp(thumbBuf)
          .extract({ left: roiX, top: roiY, width: roiW, height: roiH })
          .resize(roiW * 3, roiH * 3, { kernel: 'nearest' })
          .sharpen()
          .toBuffer();
        const qty = await this.extractQuantityFromCorner(sharp, roiBuf);
        if (qty > 0) cell.quantity = qty;
      } catch {
        /* skip */
      }
    }

    return { gridSize: { cols, rows }, cells };
  }

  /**
   * V2.10.5: 半自动画框切图 — 用户框选整个装备区域，按 cols×rows 等分 + 内缩10%
   */
  async gridParseWithAnchor(
    imageBuffer: Buffer,
    layout: string,
    anchor: { x: number; y: number; w: number; h: number },
  ): Promise<{
    gridSize: { cols: number; rows: number };
    cells: Array<{
      row: number;
      col: number;
      thumbnail: string;
      quantity: number;
      detectedLevel: number | null;
      detectedQuality: number | null;
      matchedName?: string;
      matchedCatalogId?: number;
      matchedConfidence?: number;
    }>;
  }> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    // 解析 layout
    let cols = 5,
      rows = 7;
    const parts = layout.split('x').map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      cols = parts[0];
      rows = parts[1];
    }

    // anchor = 整个装备区域的坐标（已换算为实际图片像素）
    const regionX = anchor.x;
    const regionY = anchor.y;
    const regionW = anchor.w;
    const regionH = anchor.h;

    // 精确比例关系（基于 Albion 截图实测）：
    // 装备区 = N个格子 + (N-1)个间隙
    // 格子宽度:间隙宽度 ≈ 18:1（间隙约为格子的5.5%）
    // 公式：totalW = cols * cellW + (cols-1) * gap
    //        gap = cellW * 0.055
    //        totalW = cols * cellW + (cols-1) * cellW * 0.055
    //        cellW = totalW / (cols + (cols-1) * 0.055)
    const gapRatio = 0.055; // 间隙 = 格子宽度的 5.5%
    const cellW = regionW / (cols + (cols - 1) * gapRatio);
    const cellH = regionH / (rows + (rows - 1) * gapRatio);
    const gapW = cellW * gapRatio;
    const gapH = cellH * gapRatio;

    this.logger.log(
      `[V2.10.5 anchor] 装备区: (${regionX},${regionY}) ${regionW}x${regionH}, cell=${cellW.toFixed(1)}x${cellH.toFixed(1)}, gap=${gapW.toFixed(1)}x${gapH.toFixed(1)}, layout=${cols}x${rows}`,
    );

    const cells: any[] = [];
    const CONCURRENCY = 3;
    const tasks: Array<() => Promise<void>> = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tasks.push(async () => {
          try {
            // 精确坐标：每格起点 = 区域起点 + c * (cellW + gapW)
            const left = Math.round(regionX + c * (cellW + gapW));
            const top = Math.round(regionY + r * (cellH + gapH));
            const w = Math.round(cellW);
            const h = Math.round(cellH);

            if (
              left < 0 ||
              top < 0 ||
              left + w > width ||
              top + h > height ||
              w < 10 ||
              h < 10
            )
              return;

            const subBuf = await sharp(imageBuffer)
              .extract({ left, top, width: w, height: h })
              .toBuffer();

            // 过滤空白格子
            const stats = await sharp(subBuf).stats();
            const avg = stats.channels[0]?.mean || 0;
            const std = stats.channels[0]?.stdev || 0;
            if (avg < 15 || avg > 240) return;
            if (avg > 140 && avg < 220 && std < 25) return;

            const thumbnail = await sharp(subBuf)
              .resize(120, 120, { fit: 'cover' })
              .png()
              .toBuffer();
            const quantity = await this.extractQuantityFromCorner(
              sharp,
              subBuf,
            );
            const detectedQuality = await this.detectQualityFromBorder(
              sharp,
              subBuf,
            );

            cells.push({
              row: r,
              col: c,
              thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
              quantity,
              detectedLevel: null,
              detectedQuality,
            });
          } catch {
            /* skip */
          }
        });
      }
    }

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((t) => t()));
    }

    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    this.logger.log(
      `[V2.10.5 anchor] 切图完成: ${cells.length}/${cols * rows} 格有效`,
    );

    await this.prefillGridCellsByLayeredPhash(sharp, cells);

    return { gridSize: { cols, rows }, cells };
  }

  /**
   * V2.9.9.1: 按指定 layout 固定网格切图（替代自动探测）
   * layout: '5x7'(公会岛/军箱/背包中) | '4x5'(背包大) | '6x8'(背包小) | '5x2'(蛋箱)
   */
  async gridParseForManualInput(
    imageBuffer: Buffer,
    layout?: string,
    cropRegion?: { topPercent: number; bottomPercent: number },
  ): Promise<{
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
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖');
    }

    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) throw new Error('无法读取图片尺寸');

    // V2.9.9.1: 解析 layout 参数（默认 5x7）
    let cols = 5,
      rows = 7;
    if (layout) {
      const parts = layout.split('x').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        cols = parts[0];
        rows = parts[1];
      }
    }

    // V2.10.3: 使用 opencv-wasm findContours 精确检测装备格子
    const detectedCells: Array<{
      left: number;
      top: number;
      width: number;
      height: number;
    }> = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const opencvModule = require('opencv-wasm');
      const cv: any = opencvModule.cv;

      // 将 sharp buffer 转为 OpenCV Mat
      const rawBuf = await sharp(imageBuffer).raw().ensureAlpha().toBuffer();
      const mat = new cv.Mat(height, width, cv.CV_8UC4);
      mat.data.set(rawBuf);

      // 转灰度
      const gray = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

      // 自适应阈值二值化（反转：装备格子边框变白，背景变黑）
      const binary = new cv.Mat();
      cv.adaptiveThreshold(
        gray,
        binary,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        15,
        -2,
      );

      // 形态学操作：膨胀连接边框断裂
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      const morphed = new cv.Mat();
      cv.dilate(binary, morphed, kernel, new cv.Point(-1, -1), 1);

      // 查找轮廓
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        morphed,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      // 过滤轮廓：只保留接近正方形且面积合理的（装备格子）
      const expectedCellArea = (width / cols) * (height / (rows + 2)); // 粗估每格面积
      const minArea = expectedCellArea * 0.3;
      const maxArea = expectedCellArea * 2.5;
      const candidates: Array<{
        x: number;
        y: number;
        w: number;
        h: number;
        area: number;
      }> = [];

      for (let i = 0; i < contours.size(); i++) {
        const rect = cv.boundingRect(contours.get(i));
        const area = rect.width * rect.height;
        const aspectRatio = rect.width / rect.height;

        // 近正方形 (0.6~1.6) + 面积合理
        if (
          area >= minArea &&
          area <= maxArea &&
          aspectRatio >= 0.6 &&
          aspectRatio <= 1.6
        ) {
          candidates.push({
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
            area,
          });
        }
      }

      // 按位置排序（先 y 后 x）
      candidates.sort((a, b) => {
        const rowDiff = Math.abs(a.y - b.y);
        if (rowDiff < 15) return a.x - b.x; // 同行按 x 排
        return a.y - b.y;
      });

      this.logger.log(
        `[V2.10.3] OpenCV findContours: ${contours.size()} 轮廓, ${candidates.length} 候选格子 (期望面积${minArea.toFixed(0)}~${maxArea.toFixed(0)})`,
      );

      // 如果候选格子数量接近预期（±20%），直接使用
      const expected = cols * rows;
      if (
        candidates.length >= expected * 0.7 &&
        candidates.length <= expected * 1.5
      ) {
        // 取前 expected 个（最多）
        const finalCells = candidates.slice(0, expected);
        for (const c of finalCells) {
          // 内缩 2px 去掉边框
          detectedCells.push({
            left: c.x + 2,
            top: c.y + 2,
            width: c.w - 4,
            height: c.h - 4,
          });
        }
      } else if (candidates.length > 0) {
        // 候选数量不对，用候选的中位数大小推算网格
        const medianW = candidates.sort((a, b) => a.w - b.w)[
          Math.floor(candidates.length / 2)
        ].w;
        const medianH = candidates.sort((a, b) => a.h - b.h)[
          Math.floor(candidates.length / 2)
        ].h;
        // 用第一个候选推算起始位置
        const firstY = Math.min(...candidates.map((c) => c.y));
        const firstX = Math.min(...candidates.map((c) => c.x));

        this.logger.log(
          `[V2.10.3] 候选数${candidates.length}≠期望${expected}, 用中位数(${medianW}x${medianH})从(${firstX},${firstY})推算网格`,
        );

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const left = firstX + c * medianW + 2;
            const top = firstY + r * medianH + 2;
            if (left + medianW - 4 <= width && top + medianH - 4 <= height) {
              detectedCells.push({
                left,
                top,
                width: medianW - 4,
                height: medianH - 4,
              });
            }
          }
        }
      }

      // 释放内存
      mat.delete();
      gray.delete();
      binary.delete();
      morphed.delete();
      kernel.delete();
      contours.delete();
      hierarchy.delete();
    } catch (err) {
      this.logger.warn(`[V2.10.3] OpenCV检测失败: ${err}, 使用fallback`);
    }

    // fallback: 简单等分（如果 OpenCV 失败）
    if (detectedCells.length === 0) {
      // 用图片宽度/cols作为格子宽，跳过顶部14%和底部13%
      const topCrop = Math.round(height * 0.14);
      const bottomCrop = Math.round(height * 0.13);
      const gridH = height - topCrop - bottomCrop;
      const cellW = Math.floor(width / cols);
      const cellH = Math.floor(gridH / rows);

      this.logger.log(
        `[V2.10.3] fallback等分: top=${topCrop}, gridH=${gridH}, cell=${cellW}x${cellH}`,
      );

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const left = c * cellW + 2;
          const top = topCrop + r * cellH + 2;
          detectedCells.push({
            left,
            top,
            width: cellW - 4,
            height: cellH - 4,
          });
        }
      }
    }

    this.logger.log(
      `[V2.10.3 gridParse] 检测到 ${detectedCells.length} 个格子位置`,
    );

    const cells: any[] = [];
    const MAX_CELLS = 60;
    const CONCURRENCY = 3;
    const tasks: Array<() => Promise<void>> = [];

    for (let i = 0; i < detectedCells.length && i < MAX_CELLS; i++) {
      const cellRect = detectedCells[i];
      const cellIndex = i;
      tasks.push(async () => {
        try {
          const subBuf = await sharp(imageBuffer)
            .extract({
              left: cellRect.left,
              top: cellRect.top,
              width: cellRect.width,
              height: cellRect.height,
            })
            .toBuffer();

          // 过滤空白格子
          const stats = await sharp(subBuf).stats();
          const avgBrightness = stats.channels[0]?.mean || 0;
          const stdDev = stats.channels[0]?.stdev || 0;
          if (avgBrightness < 15 || avgBrightness > 240) return;
          if (avgBrightness > 140 && avgBrightness < 220 && stdDev < 25) return;

          // 缩略图
          const thumbnail = await sharp(subBuf)
            .resize(120, 120, { fit: 'cover' })
            .png()
            .toBuffer();

          // 数量 OCR
          const quantity = await this.extractQuantityFromCorner(sharp, subBuf);

          // 品质边框检测
          const detectedQuality = await this.detectQualityFromBorder(
            sharp,
            subBuf,
          );

          cells.push({
            row: Math.floor(cellIndex / cols),
            col: cellIndex % cols,
            thumbnail: `data:image/png;base64,${thumbnail.toString('base64')}`,
            quantity,
            detectedLevel: null,
            detectedQuality,
          });
        } catch (err) {
          this.logger.warn(`[V2.10.1] 格子${cellIndex}解析失败: ${err}`);
        }
      });
    }

    // 分批并发执行
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((t) => t()));
    }

    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    this.logger.log(
      `[V2.10 gridParse] 解析完成: ${cells.length}/${cols * rows} 格有效 (layout=${layout || '5x7'})`,
    );

    await this.prefillGridCellsByLayeredPhash(sharp, cells);

    return { gridSize: { cols, rows }, cells };
  }

  private getOfficialImageDir(): string {
    return (
      process.env.OFFICIAL_IMAGE_LIBRARY_DIR ||
      join(
        process.cwd(),
        '..',
        'downloads',
        'official-image-library',
        'ImageResources',
      )
    );
  }

  private async buildOfficialFallbackHashes(
    sharp: any,
    limit = 3000,
  ): Promise<
    Array<{ catalog: EquipmentCatalog; hash: string; source: string }>
  > {
    const dir = this.getOfficialImageDir();
    let files: string[] = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const catalogs = await this.catalogRepo.find({
      select: [
        'id',
        'name',
        'albionId',
        'level',
        'quality',
        'category',
        'gearScore',
      ],
    });
    const catalogMap = new Map(
      catalogs.filter((c) => c.albionId).map((c) => [c.albionId, c]),
    );
    const result: Array<{
      catalog: EquipmentCatalog;
      hash: string;
      source: string;
    }> = [];
    for (const file of files.slice(0, limit)) {
      const match = file.match(/^(.+)-Quality=\d+\.(png|jpg|jpeg|webp)$/i);
      if (!match) continue;
      const catalog = catalogMap.get(match[1]);
      if (!catalog) continue;
      try {
        const buf = await fs.readFile(join(dir, file));
        // V2.13: catalog 模式预处理 official 图片
        const rawPixels = await this.preprocessForPhash(sharp, buf, 'catalog');
        const hash = this.computePhashFromRaw(rawPixels);
        if (hash) result.push({ catalog, hash, source: 'official' });
      } catch {
        /* skip */
      }
      if (result.length >= limit) break;
    }
    return result;
  }

  /**
   * V2.12: 精确网格切图（基于 inventory-grid-recognition-rules.md 规则）
   * 前端传入 outerRect + anchorCell（firstCellRect 的 width/height）
   * 间隙精确推算：gapX = (outerRect.width - cols * cellWidth) / (cols - 1)
   * 起始坐标用 outerRect.left/top（firstCell 在 outerRect 内左上角）
   * 中心裁剪规则：xRatio=0.15, yRatio=0.12, widthRatio=0.70, heightRatio=0.72（不对称，y方向偏上）
   * 返回四档状态：matched / review / unknown / empty
   */
  /**
   * V2.12.1 中心点定位法：
   * 1. 以 outerRect 为整个网格区域（含间隙）
   * 2. 均匀计算每格中心点 = outerRect 左上角 + (c+0.5)/cols * width, (r+0.5)/rows * height
   * 3. 从中心点向四周扩展 CELL_CONTENT_RATIO（~88%步长）作为实际切图区域，自动排除间隙
   * 4. 空格检测后直接丢弃，不返回前端
   */
  async gridParseByRegion(
    imageBuffer: Buffer,
    cols: number,
    rows: number,
    outerRect: { left: number; top: number; width: number; height: number },
    _anchorCell?: { width: number; height: number },
  ): Promise<{
    gridSize: { cols: number; rows: number };
    cells: Array<{
      row: number;
      col: number;
      index: number;
      thumbnail: string;
      quantity: number;
      detectedLevel: number | null;
      detectedQuality: number | null;
      matchedName?: string;
      matchedCatalogId?: number;
      matchedConfidence?: number;
      matchSource?: string;
      matchStatus: 'matched' | 'review' | 'unknown' | 'empty';
    }>;
  }> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('sharp 依赖未安装');
    }

    // 获取原图尺寸用于边界检查
    const metadata = await sharp(imageBuffer).metadata();
    const imgW = metadata.width || 0;
    const imgH = metadata.height || 0;

    // 防御性检查：cols/rows 必须在合理范围
    if (cols < 1 || cols > 20 || rows < 1 || rows > 20) {
      this.logger.warn(`[gridParse] 非法网格参数: cols=${cols}, rows=${rows}`);
      return { gridSize: { cols, rows }, cells: [] };
    }

    // 步长：每格占整个框的 1/cols 宽、1/rows 高
    const stepX = outerRect.width / cols;
    const stepY = outerRect.height / rows;

    // 格子内容比例（排除间隙后的有效区域占步长的比例）
    // 游戏内装备格子间隙约占 5-8%，取 88% 作为格子内容区域
    const CELL_CONTENT_RATIO = 0.88;
    // 格子实际切图尺寸（正方形，取宽高步长中较小的，确保不越界）
    const cellSize = Math.min(stepX, stepY) * CELL_CONTENT_RATIO;

    // 中心裁剪规则（不对称：y 方向偏上，去左上角等级标记）
    const CROP_X_RATIO = 0.15;
    const CROP_Y_RATIO = 0.12;
    const CROP_W_RATIO = 0.70;
    const CROP_H_RATIO = 0.72;

    // 空格检测阈值（标准差低于此值视为空）
    const EMPTY_STDDEV_THRESHOLD = 18;

    this.logger.log(
      `[V2.12.1 gridParse] ${cols}x${rows}, outer=(${outerRect.left},${outerRect.top},${outerRect.width}x${outerRect.height}), stepX=${stepX.toFixed(1)}, stepY=${stepY.toFixed(1)}, cellSize=${cellSize.toFixed(1)}, imgSize=${imgW}x${imgH}`,
    );

    const cells: any[] = [];
    let index = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // 每格中心点坐标（均匀分布）
        const centerX = outerRect.left + (c + 0.5) * stepX;
        const centerY = outerRect.top + (r + 0.5) * stepY;

        // 从中心点向四周扩展，得到格子切图区域
        const halfSize = cellSize / 2;
        let fullLeft = Math.round(centerX - halfSize);
        let fullTop = Math.round(centerY - halfSize);
        let fullW = Math.round(cellSize);
        let fullH = Math.round(cellSize);

        // 边界安全检查
        if (fullLeft < 0) fullLeft = 0;
        if (fullTop < 0) fullTop = 0;
        if (fullLeft + fullW > imgW) fullW = imgW - fullLeft;
        if (fullTop + fullH > imgH) fullH = imgH - fullTop;
        if (fullW < 10 || fullH < 10) { index++; continue; }

        // 中心主体区域（不对称裁剪，用于 pHash 匹配）
        const centerLeft = Math.round(centerX - halfSize + cellSize * CROP_X_RATIO);
        const centerTop2 = Math.round(centerY - halfSize + cellSize * CROP_Y_RATIO);
        let centerW = Math.round(cellSize * CROP_W_RATIO);
        let centerH = Math.round(cellSize * CROP_H_RATIO);

        // 中心区域边界安全
        const cLeft = Math.max(0, centerLeft);
        const cTop = Math.max(0, centerTop2);
        if (cLeft + centerW > imgW) centerW = imgW - cLeft;
        if (cTop + centerH > imgH) centerH = imgH - cTop;

        try {
          // 空格检测：计算标准差
          const stats = await sharp(imageBuffer)
            .extract({ left: fullLeft, top: fullTop, width: fullW, height: fullH })
            .stats();
          const avgStdDev =
            stats.channels.reduce(
              (sum: number, ch: any) => sum + (ch.stdev || 0),
              0,
            ) / stats.channels.length;

          if (avgStdDev < EMPTY_STDDEV_THRESHOLD) {
            // 空格：直接丢弃，不加入 cells
            index++;
            continue;
          }

          // 缩略图（完整格子区域）
          const fullBuf = await sharp(imageBuffer)
            .extract({ left: fullLeft, top: fullTop, width: fullW, height: fullH })
            .png()
            .toBuffer();
          const thumbBuf = await sharp(fullBuf)
            .resize(80, 80, { fit: 'cover' })
            .png()
            .toBuffer();
          const thumbnail = `data:image/png;base64,${thumbBuf.toString('base64')}`;

          // 中心主体（用于 pHash 匹配）
          let centerBase64 = '';
          if (centerW > 10 && centerH > 10) {
            const centerBuf = await sharp(imageBuffer)
              .extract({
                left: cLeft,
                top: cTop,
                width: centerW,
                height: centerH,
              })
              .resize(64, 64, { fit: 'cover' })
              .png()
              .toBuffer();
            centerBase64 = `data:image/png;base64,${centerBuf.toString('base64')}`;
          }

          // 从右下角 OCR 提取数量（先检测是否有数字特征，避免无效 OCR 请求）
          let quantity = 1;
          try {
            const meta = await sharp(fullBuf).metadata();
            const fw = meta.width || 80;
            const fh = meta.height || 80;
            if (fw >= 48 && fh >= 48) {
              // 裁右下角 35%×35%，检测亮色像素占比（数字通常为白色）
              const cropW = Math.round(fw * 0.35);
              const cropH = Math.round(fh * 0.35);
              const cornerStats = await sharp(fullBuf)
                .extract({ left: fw - cropW, top: fh - cropH, width: cropW, height: cropH })
                .stats();
              const avgMean = cornerStats.channels.reduce((s: number, ch: any) => s + (ch.mean || 0), 0) / cornerStats.channels.length;
              const avgStd = cornerStats.channels.reduce((s: number, ch: any) => s + (ch.stdev || 0), 0) / cornerStats.channels.length;
              // 右下角有亮色区域（数字背景通常是暗圆+白字，标准差 > 30 且均值适中）
              if (avgStd > 25) {
                quantity = await this.extractQuantityFromCorner(sharp, fullBuf);
              }
            }
          } catch { /* 提取失败默认1 */ }

          // 从边框颜色检测品质
          let detectedQuality: number | null = null;
          try {
            detectedQuality = await this.detectQualityFromBorder(sharp, fullBuf);
          } catch { /* 检测失败 */ }

          cells.push({
            row: r,
            col: c,
            index,
            thumbnail,
            centerThumbnail: centerBase64,
            quantity,
            detectedLevel: null,
            detectedQuality,
            matchStatus: 'unknown' as const,
          });
        } catch (err) {
          this.logger.warn(
            `[V2.12.1 gridParse] 切图异常 row=${r} col=${c}: ${err}`,
          );
          // 切图失败：跳过该格
        }
        index++;
      }
    }

    this.logger.log(
      `[V2.12.1 gridParse] 切图完成: ${cells.length} 格有效 / ${cols * rows} 格总计（空格已丢弃）`,
    );

    // pHash 分层匹配
    await this.prefillGridCellsByLayeredPhash(sharp, cells);

    // 四档状态判定
    for (const cell of cells) {
      const conf = cell.matchedConfidence || 0;
      if (conf >= 0.70) {
        cell.matchStatus = 'matched';
      } else if (conf >= 0.50) {
        cell.matchStatus = 'review';
      } else {
        cell.matchStatus = 'unknown';
      }
    }

    return { gridSize: { cols, rows }, cells };
  }

  private async prefillGridCellsByLayeredPhash(
    sharp: any,
    cells: any[],
  ): Promise<void> {
    try {
      const catalogs = await this.catalogRepo.find({
        where: {},
        select: [
          'id',
          'name',
          'albionId',
          'imagePhash',
          'category',
          'gearScore',
          'level',
          'quality',
        ],
      });
      const hotImages = await this.imageRepo.find({
        where: { imageType: 'hot' },
      });
      const hotCandidates: Array<{
        catalog: EquipmentCatalog;
        hash: string;
        source: string;
      }> = [];
      const catalogById = new Map(catalogs.map((c) => [c.id, c]));
      for (const img of hotImages) {
        const catalog = catalogById.get(img.catalogId);
        if (!catalog) continue;
        try {
          const imgPath = join(process.cwd(), img.imageUrl.replace(/^\//, ''));
          const buf = await fs.readFile(imgPath);
          // V2.13: inventory 模式预处理 hot 图片
          const rawPixels = await this.preprocessForPhash(sharp, buf, 'inventory');
          const hash = this.computePhashFromRaw(rawPixels);
          if (hash) hotCandidates.push({ catalog, hash, source: 'hot' });
        } catch {
          /* skip */
        }
      }
      const phashCandidates = catalogs
        .filter((c) => c.imagePhash)
        .map((c) => ({ catalog: c, hash: c.imagePhash, source: 'phash' }));
      let officialCandidates: Array<{
        catalog: EquipmentCatalog;
        hash: string;
        source: string;
      }> | null = null;

      for (const cell of cells) {
        try {
          // 优先使用 centerThumbnail（已去除边框+角标干扰），回退到 thumbnail
          const srcBase64 = (cell.centerThumbnail || cell.thumbnail || '').replace(
            /^data:image\/\w+;base64,/,
            '',
          );
          if (!srcBase64) continue;
          const srcBuf = Buffer.from(srcBase64, 'base64');
          // V2.13: inventory 模式预处理 — 统一管线（centerThumbnail 和 thumbnail 都走新管线）
          const rawPixels = await this.preprocessForPhash(sharp, srcBuf, 'inventory');
          const cellHash = this.computePhashFromRaw(rawPixels);
          if (!cellHash) continue;
          const tryMatch = (
            candidates: Array<{
              catalog: EquipmentCatalog;
              hash: string;
              source: string;
            }>,
            threshold: number,
          ) => {
            let bestDist = 999;
            let best: {
              catalog: EquipmentCatalog;
              hash: string;
              source: string;
            } | null = null;
            for (const candidate of candidates) {
              const dist = this.hammingDistance(cellHash, candidate.hash);
              if (dist < bestDist) {
                bestDist = dist;
                best = candidate;
              }
            }
            if (!best || bestDist > threshold) return null;
            return {
              ...best,
              distance: bestDist,
              confidence: parseFloat((1 - bestDist / 64).toFixed(2)),
            };
          };

          let matched = tryMatch(
            hotCandidates,
            ImageMatchService.STRICT_HAMMING_THRESHOLD,
          );
          if (!matched)
            matched = tryMatch(
              phashCandidates,
              ImageMatchService.LOOSE_HAMMING_THRESHOLD,
            );
          if (!matched) {
            if (!officialCandidates)
              officialCandidates = await this.buildOfficialFallbackHashes(
                sharp,
                3000,
              );
            matched = tryMatch(
              officialCandidates,
              ImageMatchService.STRICT_HAMMING_THRESHOLD,
            );
          }
          if (matched) {
            const cat = matched.catalog;
            cell.matchedName = cat.name;
            cell.matchedCatalogId = cat.id;
            cell.matchedConfidence = matched.confidence;
            cell.matchSource = matched.source;
            // 等级品质：保留图片检测值，仅未检测到时用参考库兜底
            if (cell.detectedLevel == null) cell.detectedLevel = cat.level || null;
            if (cell.detectedQuality == null) cell.detectedQuality = cat.quality ?? null;
            cell.matchedCategory = cat.category || '';
            cell.matchedGearScore = cat.gearScore || 0;
            cell.albionId = cat.albionId || null;
          }
        } catch {
          /* skip */
        }
      }
      const matchedCount = cells.filter((c: any) => c.matchedName).length;
      this.logger.log(
        `[gridParse] 分层匹配: ${matchedCount}/${cells.length} 格匹配成功（hot→pHash→official）`,
      );

      // V2.14.4: AI 特征向量精排 — 对所有已匹配的格子都用 embedding 重排
      // pHash 对品质背景色敏感导致大量假阳性，AI 特征向量对形状更敏感
      const hasEmbeddings = catalogs.some(c => c.imageEmbedding);
      if (hasEmbeddings) {
        const matchedCells = cells.filter((c: any) => c.matchedName);
        if (matchedCells.length > 0) {
          this.logger.log(`[V2.14] 对 ${matchedCells.length} 格执行 AI 精排...`);
          let refined = 0;
          for (const cell of matchedCells) {
            try {
              const srcBase64 = (cell.centerThumbnail || cell.thumbnail || '').replace(/^data:image\/\w+;base64,/, '');
              if (!srcBase64) continue;
              const srcBuf = Buffer.from(srcBase64, 'base64');
              const result = await this.matchByEmbedding(srcBuf, 'inventory');
              if (result && result.similarity > cell.matchedConfidence) {
                const oldName = cell.matchedName;
                cell.matchedName = result.name;
                cell.matchedCatalogId = result.catalogId;
                cell.matchedConfidence = result.similarity;
                cell.matchSource = 'ai';
                refined++;
                this.logger.debug(`[V2.14] AI精排: ${oldName} → ${result.name} (${result.similarity})`);
              }
            } catch { /* skip */ }
          }
          this.logger.log(`[V2.14] AI精排完成: ${refined}/${matchedCells.length} 格被优化`);
        }
      }
    } catch (err) {
      this.logger.warn(`[gridParse] 分层匹配失败: ${err}`);
    }
  }

  /**
   * 检测装备图标的品质边框颜色

   * Albion 品质边框：灰(Q0) / 绿(Q1) / 蓝(Q2) / 紫(Q3) / 金(Q4)
   * 采样四条边中央的像素平均色 → HSV → 映射到品质等级
   */
  private async detectQualityFromBorder(
    sharp: any,
    subBuf: Buffer,
  ): Promise<number | null> {
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
          left: Math.round(w * 0.3),
          top: 1,
          width: Math.round(w * 0.4),
          height: borderThickness,
        })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // 计算平均 RGB
      let rSum = 0,
        gSum = 0,
        bSum = 0;
      const pixelCount = data.length / 3;
      for (let i = 0; i < data.length; i += 3) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
      }
      const r = rSum / pixelCount,
        g = gSum / pixelCount,
        b = bSum / pixelCount;

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
      if (hue >= 80 && hue <= 160) return 1; // 绿
      if (hue >= 180 && hue <= 250) return 2; // 蓝
      if (hue >= 260 && hue <= 320) return 3; // 紫
      if (hue >= 30 && hue <= 70 && lightness > 0.5) return 4; // 金/橙
      return 0; // 默认灰
    } catch {
      return null;
    }
  }

  // ===== V2.14: @xenova/transformers AI 特征向量匹配 =====

  /** 缓存的 pipeline 实例（避免重复加载模型） */
  private static featureExtractor: any = null;
  private static featureExtractorLoading = false;

  /**
   * 获取或初始化特征提取 pipeline（首次调用会下载模型 ~350MB）
   */
  private async getFeatureExtractor(): Promise<any> {
    if (ImageMatchService.featureExtractor) return ImageMatchService.featureExtractor;
    if (ImageMatchService.featureExtractorLoading) {
      // 等待其他请求完成加载
      for (let i = 0; i < 300; i++) {
        await new Promise(r => setTimeout(r, 1000));
        if (ImageMatchService.featureExtractor) return ImageMatchService.featureExtractor;
      }
      throw new Error('特征提取模型加载超时');
    }
    ImageMatchService.featureExtractorLoading = true;
    try {
      this.logger.log('[V2.14] 正在加载 ViT 特征提取模型...');
      // V2.14.2: 强制离线模式 + 指定缓存路径，避免联网下载
      process.env.TRANSFORMERS_OFFLINE = '1';
      process.env.HF_HUB_OFFLINE = '1';
      if (!process.env.TRANSFORMERS_CACHE) {
        const homedir = require('os').homedir();
        process.env.TRANSFORMERS_CACHE = join(homedir, '.cache', 'huggingface', 'hub');
      }
      this.logger.log(`[V2.14] 缓存路径: ${process.env.TRANSFORMERS_CACHE}, 离线模式: ON`);

      const importDynamic = new Function('specifier', 'return import(specifier)');
      const transformersModule = await importDynamic('@xenova/transformers');
      // 设置 env 配置确保离线
      if (transformersModule.env) {
        transformersModule.env.useBrowserCache = false;
        transformersModule.env.useCustomCache = false;
        transformersModule.env.allowLocalModels = true;
        if (transformersModule.env.localModelPath === undefined) {
          transformersModule.env.cacheDir = process.env.TRANSFORMERS_CACHE;
        }
      }
      const { pipeline } = transformersModule;
      ImageMatchService.featureExtractor = await pipeline(
        'image-feature-extraction',
        'Xenova/vit-base-patch16-224',
        { local_files_only: true },
      );
      this.logger.log('[V2.14] ViT 模型加载完成');
      return ImageMatchService.featureExtractor;
    } catch (err) {
      ImageMatchService.featureExtractorLoading = false;
      this.logger.error(`[V2.14] 模型加载失败: ${err}`);
      throw err;
    }
  }

  /**
   * V2.14.3: 从 224x224 RGB raw 像素数据提取 768 维特征向量
   * @param rawData 224*224*3 = 150528 字节的 RGB raw buffer
   */
  async extractEmbeddingFromRaw(rawData: Buffer): Promise<number[]> {
    const extractor = await this.getFeatureExtractor();
    const importDynamic = new Function('specifier', 'return import(specifier)');
    const { RawImage } = await importDynamic('@xenova/transformers');
    const img = new RawImage(new Uint8ClampedArray(rawData), 224, 224, 3);
    const output = await extractor(img, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  /**
   * V2.14.3: 从任意图片 Buffer 提取特征向量（自动 resize + raw 转换）
   */
  async extractEmbedding(imageBuffer: Buffer): Promise<number[]> {
    const sharp = require('sharp');
    const rawBuf = await sharp(imageBuffer)
      .resize(224, 224, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer();
    return this.extractEmbeddingFromRaw(rawBuf);
  }

  /**
   * V2.14: 余弦相似度计算
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * V2.14.3: 为单个参考库装备生成特征向量
   * 只从本地文件读取（hot截图 > 本地缓存 > official图片库），不访问远程URL
   */
  async generateEmbeddingForCatalog(
    catalogId: number,
    imageUrl: string,
    localImagePath?: string | null,
    hotImagePath?: string | null,
    albionId?: string | null,
  ): Promise<number[] | null> {
    let sharp: any;
    try { sharp = require('sharp'); } catch { return null; }

    let buffer: Buffer | null = null;

    // 1. 优先读热门截图
    if (hotImagePath) {
      try {
        buffer = await fs.readFile(join(process.cwd(), hotImagePath.replace(/^\//, '')));
        if (buffer.length === 0) buffer = null;
      } catch { buffer = null; }
    }

    // 2. 其次读本地缓存文件
    if (!buffer && localImagePath) {
      try {
        buffer = await fs.readFile(join(process.cwd(), localImagePath.replace(/^\//, '')));
        if (buffer.length === 0) buffer = null;
      } catch { buffer = null; }
    }

    // 3. 再次读 official 图片库（按 albionId 匹配文件名）
    if (!buffer && albionId) {
      const officialDir = this.getOfficialImageDir();
      // official 文件名格式: {albionId}-Quality={N}.png
      for (const q of [0, 1, 2, 3, 4]) {
        try {
          const filePath = join(officialDir, `${albionId}-Quality=${q}.png`);
          buffer = await fs.readFile(filePath);
          if (buffer.length > 0) break;
          buffer = null;
        } catch { /* try next quality */ }
      }
    }

    // V2.14.3: 远程URL已禁用 — 服务器外网不稳定，只用本地文件
    // if (!buffer && imageUrl && imageUrl.startsWith('http')) {
    //   try {
    //     const response = await fetch(imageUrl, { ... });
    //     if (response.ok) buffer = Buffer.from(await response.arrayBuffer());
    //   } catch { /* skip */ }
    // }

    if (!buffer) return null;

    try {
      const meta = await sharp(buffer).metadata();
      const w = meta.width || 64;
      const h = meta.height || 64;
      const cropLeft = Math.round(w * 0.15);
      const cropTop = Math.round(h * 0.12);
      const cropW = Math.round(w * 0.70);
      const cropH = Math.round(h * 0.72);

      const preprocessed = await sharp(buffer)
        .flatten({ background: ImageMatchService.GRAY_BG })
        .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
        .resize(224, 224, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer();

      return await this.extractEmbeddingFromRaw(preprocessed);
    } catch (err) {
      this.logger.warn(`[V2.14] 特征向量生成失败 catalogId=${catalogId}: ${err}`);
      return null;
    }
  }

  /**
   * V2.14.3: 批量为所有参考库装备生成特征向量
   * 只处理有本地图片的装备（hot > local > official），跳过只有远程URL的
   */
  async batchGenerateEmbeddings(
    force = false,
  ): Promise<{ total: number; success: number; failed: number; skipped: number }> {
    // 先预加载模型
    await this.getFeatureExtractor();

    const catalogs = await this.catalogRepo.find({
      where: {},
      select: ['id', 'imageUrl', 'localImagePath', 'hotImagePath', 'imageEmbedding', 'albionId'],
    });

    let success = 0, failed = 0, skipped = 0;

    for (let i = 0; i < catalogs.length; i++) {
      const cat = catalogs[i];
      if (!force && cat.imageEmbedding) { success++; continue; }

      // 跳过没有任何本地图片的装备
      if (!cat.hotImagePath && !cat.localImagePath && !cat.albionId) {
        skipped++;
        continue;
      }

      try {
        const embedding = await this.generateEmbeddingForCatalog(
          cat.id, cat.imageUrl, cat.localImagePath, cat.hotImagePath, cat.albionId,
        );
        if (embedding) {
          await this.catalogRepo.update(cat.id, { imageEmbedding: JSON.stringify(embedding) });
          success++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }

      if ((i + 1) % 50 === 0) {
        this.logger.log(`[V2.14] 特征向量进度: ${i + 1}/${catalogs.length} (成功${success}/失败${failed}/跳过${skipped})`);
      }
    }

    this.logger.log(`[V2.14] 特征向量批量生成完成: success=${success}, failed=${failed}, skipped=${skipped}, total=${catalogs.length}`);
    return { total: catalogs.length, success, failed, skipped };
  }

  /**
   * V2.14: 用特征向量匹配装备（对截图子图）
   * pHash 粗筛 Top20 → 特征向量精排 → Top1
   */
  async matchByEmbedding(
    subImageBuffer: Buffer,
    mode: 'inventory' | 'resupply' = 'inventory',
  ): Promise<{ catalogId: number; name: string; similarity: number } | null> {
    let sharp: any;
    try { sharp = require('sharp'); } catch { return null; }

    // Step 1: pHash 粗筛 — 取 Top20
    const rawPixels = await this.preprocessForPhash(sharp, subImageBuffer, mode);
    const cellHash = this.computePhashFromRaw(rawPixels);

    const catalogs = await this.catalogRepo.find({
      where: {},
      select: ['id', 'name', 'imagePhash', 'imageEmbedding', 'level', 'quality', 'category', 'gearScore'],
    });

    const phashCandidates = catalogs
      .filter(c => c.imagePhash)
      .map(c => ({ cat: c, distance: this.hammingDistance(cellHash, c.imagePhash) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 20);

    if (phashCandidates.length === 0) return null;

    // Step 2: 对子图生成特征向量
    const meta = await sharp(subImageBuffer).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;
    const cropLeft = Math.round(w * 0.15);
    const cropTop = Math.round(h * 0.12);
    const cropW = Math.round(w * 0.70);
    const cropH = Math.round(h * 0.72);

    const preprocessed = await sharp(subImageBuffer)
      .flatten({ background: ImageMatchService.GRAY_BG })
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .resize(224, 224, { fit: 'fill' })
      .png()
      .toBuffer();

    let cellEmbedding: number[];
    try {
      cellEmbedding = await this.extractEmbedding(preprocessed);
    } catch {
      // 特征提取失败，fallback 到 pHash best
      const best = phashCandidates[0];
      return { catalogId: best.cat.id, name: best.cat.name, similarity: 1 - best.distance / 64 };
    }

    // Step 3: 余弦相似度精排
    let bestSim = -1;
    let bestCat: any = null;

    for (const { cat } of phashCandidates) {
      if (!cat.imageEmbedding) continue;
      try {
        const catEmbedding = JSON.parse(cat.imageEmbedding) as number[];
        const sim = this.cosineSimilarity(cellEmbedding, catEmbedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestCat = cat;
        }
      } catch { /* skip */ }
    }

    if (!bestCat || bestSim < 0.5) {
      // fallback 到 pHash best
      const best = phashCandidates[0];
      return { catalogId: best.cat.id, name: best.cat.name, similarity: 1 - best.distance / 64 };
    }

    return { catalogId: bestCat.id, name: bestCat.name, similarity: Math.round(bestSim * 100) / 100 };
  }
}

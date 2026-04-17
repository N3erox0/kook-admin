import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
 * 2. 每个子图裁切中心70%（去品质边框）→ 缩放为 32x32 灰度 → DCT → 取低频 8x8 → 生成 64bit 哈希
 * 3. 与参考库所有装备的 imagePhash 比较汉明距离
 * 4. 距离 ≤ 19 (相似度 ≥ 0.70) → 匹配成功
 */
@Injectable()
export class ImageMatchService {
  private readonly logger = new Logger(ImageMatchService.name);

  /** 匹配阈值：汉明距离 ≤ 19/64 即相似度 ≥ 0.70 */
  private static readonly HAMMING_THRESHOLD = 19;

  constructor(
    @InjectRepository(EquipmentCatalog) private catalogRepo: Repository<EquipmentCatalog>,
  ) {}

  /**
   * 从截图中识别装备图标（图片相似度匹配）
   * @param imageBuffer 上传的截图 Buffer
   * @returns 匹配到的装备列表
   */
  async matchFromScreenshot(imageBuffer: Buffer): Promise<{
    catalogId: number;
    catalogName: string;
    level: number;
    quality: number;
    category: string;
    gearScore: number;
    confidence: number;
    imageUrl: string | null;
  }[]> {
    let sharp: any;
    try {
      sharp = require('sharp');
    } catch {
      this.logger.error('sharp 模块未安装，图片相似度匹配不可用。请执行: npm install sharp');
      throw new Error('图片处理模块未安装，请联系管理员安装 sharp 依赖');
    }

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
    const results: any[] = [];
    for (const subBuf of subImages) {
      try {
        const cropped = await this.cropCenter(sharp, subBuf, 0.70);
        const hash = await this.computePhash(sharp, cropped);

        let bestMatch: any = null;
        let bestDistance = 64;

        for (const cat of catalogs) {
          if (!cat.imagePhash) continue;
          const dist = this.hammingDistance(hash, cat.imagePhash);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestMatch = cat;
          }
        }

        if (bestMatch && bestDistance <= ImageMatchService.HAMMING_THRESHOLD) {
          const confidence = 1 - bestDistance / 64;
          // 防止同一装备重复匹配
          if (!results.find(r => r.catalogId === bestMatch.id)) {
            results.push({
              catalogId: bestMatch.id,
              catalogName: bestMatch.name,
              level: bestMatch.level,
              quality: bestMatch.quality,
              category: bestMatch.category,
              gearScore: bestMatch.gearScore,
              confidence: Math.round(confidence * 100) / 100,
              imageUrl: bestMatch.imageUrl,
            });
          }
        }
      } catch (err) {
        this.logger.warn(`子图匹配失败: ${err}`);
      }
    }

    this.logger.log(`图片相似度匹配完成: ${results.length}/${subImages.length} 匹配成功`);
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
      const cropped = await this.cropCenter(sharp, buffer, 0.70);
      return this.computePhash(sharp, cropped);
    } catch (err) {
      this.logger.warn(`生成 pHash 失败 catalogId=${catalogId}: ${err}`);
      return null;
    }
  }

  /**
   * 批量为所有参考库装备生成 pHash
   * 优先从本地文件读取图片，fallback 远程 URL
   * @returns 成功/失败统计
   */
  async batchGeneratePhash(): Promise<{ total: number; success: number; failed: number }> {
    const catalogs = await this.catalogRepo.find({
      where: {},
      select: ['id', 'imageUrl', 'imagePhash', 'localImagePath'],
    });

    let success = 0, failed = 0;
    const batchSize = 20;

    for (let i = 0; i < catalogs.length; i += batchSize) {
      const batch = catalogs.slice(i, i + batchSize);
      const promises = batch.map(async (cat) => {
        if (cat.imagePhash) { success++; return; } // 已有则跳过
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

    // 对裁切后的区域执行标准匹配
    return this.matchFromScreenshot(regionBuffer);
  }

  // ===== 内部方法 =====

  /** 估算装备图标大小 */
  private estimateIconSize(imgWidth: number, imgHeight: number): number {
    // Albion 装备栏截图中图标通常是 60-80px
    // 如果图片宽度 > 300，按比例推算；否则视为单个图标
    if (imgWidth <= 120 && imgHeight <= 120) return Math.min(imgWidth, imgHeight);
    if (imgWidth <= 300) return Math.round(imgWidth / 3);
    return 72; // 默认 72px
  }

  /** 按网格切割图片为子图 */
  private async gridCut(sharp: any, buffer: Buffer, width: number, height: number, iconSize: number): Promise<Buffer[]> {
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

  /** 裁切图片中心区域（去品质边框） */
  private async cropCenter(sharp: any, buffer: Buffer, ratio: number): Promise<Buffer> {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 64;
    const h = meta.height || 64;
    const cropW = Math.round(w * ratio);
    const cropH = Math.round(h * ratio);
    const left = Math.round((w - cropW) / 2);
    const top = Math.round((h - cropH) / 2);
    return sharp(buffer)
      .extract({ left, top, width: cropW, height: cropH })
      .toBuffer();
  }

  /**
   * 计算感知哈希 (pHash)
   * 步骤：缩放 32x32 → 灰度 → DCT → 取 8x8 低频 → 中值二值化 → 64bit hex
   */
  private async computePhash(sharp: any, buffer: Buffer): Promise<string> {
    // 缩放为 32x32 灰度
    const pixels = await sharp(buffer)
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
}

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { OcrRecognitionBatch } from './entities/ocr-recognition-batch.entity';
import { OcrRecognitionItem } from './entities/ocr-recognition-item.entity';
import { ParsedEquipment } from './parsers/base.parser';
import { EquipmentParser } from './parsers/equipment.parser';
import { CatalogService } from '../equipment-catalog/catalog.service';
import { EquipmentService } from '../equipment/equipment.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly parser = new EquipmentParser();

  constructor(
    @InjectRepository(OcrRecognitionBatch) private batchRepo: Repository<OcrRecognitionBatch>,
    @InjectRepository(OcrRecognitionItem) private itemRepo: Repository<OcrRecognitionItem>,
    private configService: ConfigService,
    private catalogService: CatalogService,
    private equipmentService: EquipmentService,
  ) {}

  /** 创建 OCR 识别批次并执行识别 */
  async createBatch(guildId: number, imageUrl: string, imageType: string, userId: number, userName: string): Promise<OcrRecognitionBatch> {
    const batch = this.batchRepo.create({
      guildId,
      batchNo: `OCR-${Date.now()}-${uuidv4().slice(0, 8)}`,
      imageUrl,
      imageType,
      status: 'pending',
      uploadUserId: userId,
      uploadUserName: userName,
    });
    const saved = await this.batchRepo.save(batch);

    // 异步执行 OCR 识别
    this.processRecognition(saved).catch(err => {
      this.logger.error(`OCR批次 ${saved.batchNo} 处理失败: ${err.message}`);
    });

    return saved;
  }

  /** 执行 OCR 识别并创建 item 记录 */
  private async processRecognition(batch: OcrRecognitionBatch): Promise<void> {
    try {
      const raw = await this.recognizeImage(batch.imageUrl);
      const enriched = await this.enrichWithCatalog(raw);

      const items: OcrRecognitionItem[] = [];
      for (const eq of enriched) {
        const item = this.itemRepo.create({
          batchId: batch.id,
          guildId: batch.guildId,
          equipmentName: eq.name,
          matchedCatalogId: eq.catalogId || null,
          matchedCatalogName: eq.catalogName || null,
          level: eq.level || null,
          quality: eq.quality ?? null,
          category: eq.category || null,
          gearScore: eq.gearScore || null,
          quantity: eq.quantity || 1,
          confidence: eq.matchScore ? Math.round(eq.matchScore * 100) : null,
          ocrRawText: eq.name,
          status: 'pending',
        });
        items.push(item);
      }

      await this.itemRepo.save(items);

      batch.status = 'recognized';
      batch.totalItems = items.length;
      await this.batchRepo.save(batch);

      this.logger.log(`OCR批次 ${batch.batchNo} 识别完成, ${items.length} 件装备`);
    } catch (err: any) {
      batch.status = 'failed';
      batch.errorMessage = err.message;
      await this.batchRepo.save(batch);
    }
  }

  /** 获取批次列表 */
  async getBatches(guildId: number, page = 1, pageSize = 20) {
    const [list, total] = await this.batchRepo.findAndCount({
      where: { guildId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list, total, page, pageSize };
  }

  /** 获取批次详情（含识别结果） */
  async getBatchDetail(batchId: number) {
    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (!batch) throw new NotFoundException('批次不存在');
    const items = await this.itemRepo.find({ where: { batchId }, order: { id: 'ASC' } });
    return { batch, items };
  }

  /** 人工确认：更新单条识别结果 */
  async confirmItem(itemId: number, data: {
    confirmedName?: string;
    confirmedCatalogId?: number;
    confirmedLevel?: number;
    confirmedQuality?: number;
    confirmedQuantity?: number;
    status: 'confirmed' | 'discarded';
  }) {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('识别结果不存在');
    Object.assign(item, data);
    const saved = await this.itemRepo.save(item);

    // 更新批次统计
    const batch = await this.batchRepo.findOne({ where: { id: item.batchId } });
    if (batch) {
      const confirmedCount = await this.itemRepo.count({ where: { batchId: batch.id, status: 'confirmed' } });
      batch.confirmedItems = confirmedCount;
      if (confirmedCount === batch.totalItems) batch.status = 'confirmed';
      await this.batchRepo.save(batch);
    }

    return saved;
  }

  /** 批量确认所有 pending 项 */
  async confirmAllItems(batchId: number) {
    const items = await this.itemRepo.find({ where: { batchId, status: 'pending' } });
    for (const item of items) {
      item.status = 'confirmed';
      item.confirmedName = item.confirmedName || item.matchedCatalogName || item.equipmentName;
      item.confirmedCatalogId = item.confirmedCatalogId || item.matchedCatalogId;
      item.confirmedLevel = item.confirmedLevel || item.level;
      item.confirmedQuality = item.confirmedQuality ?? item.quality;
      item.confirmedQuantity = item.confirmedQuantity || item.quantity;
    }
    await this.itemRepo.save(items);

    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (batch) {
      batch.confirmedItems = batch.totalItems;
      batch.status = 'confirmed';
      await this.batchRepo.save(batch);
    }
    return { confirmed: items.length };
  }

  /** 将已确认的装备写入库存 */
  async saveToInventory(batchId: number, guildId: number, operatorId: number, operatorName: string) {
    const items = await this.itemRepo.find({ where: { batchId, status: 'confirmed' } });
    if (items.length === 0) throw new BadRequestException('没有已确认的装备');

    let saved = 0;
    for (const item of items) {
      const catalogId = item.confirmedCatalogId || item.matchedCatalogId;
      if (!catalogId) continue;

      await this.equipmentService.upsert(guildId, {
        catalogId,
        quantity: item.confirmedQuantity || item.quantity,
        location: '公会仓库',
      }, operatorId, operatorName, 'ocr_import');

      item.status = 'saved';
      await this.itemRepo.save(item);
      saved++;
    }

    const batch = await this.batchRepo.findOne({ where: { id: batchId } });
    if (batch) {
      batch.savedItems = saved;
      batch.status = 'saved';
      await this.batchRepo.save(batch);
    }

    return { saved };
  }

  // ===== 原有 OCR 识别方法 =====

  async recognizeImage(imageUrl: string): Promise<ParsedEquipment[]> {
    const secretId = this.configService.get<string>('tencent.secretId');
    const secretKey = this.configService.get<string>('tencent.secretKey');
    const region = this.configService.get<string>('ocr.region');

    if (!secretId || !secretKey) {
      this.logger.warn('腾讯云 OCR 密钥未配置，使用模拟数据');
      return this.getMockResult();
    }

    // 相对路径自动拼接公网域名前缀
    let fullUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http')) {
      const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3000';
      fullUrl = `${baseUrl}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
      this.logger.log(`OCR图片URL补全: ${imageUrl} → ${fullUrl}`);
    }

    const ocrTexts = await this.callTencentOcr(fullUrl, secretId, secretKey, region);
    return this.parser.parse(ocrTexts);
  }

  async recognizeAndEnrich(base64Data: string): Promise<ParsedEquipment[]> {
    const secretId = this.configService.get<string>('tencent.secretId');
    const secretKey = this.configService.get<string>('tencent.secretKey');

    if (!secretId || !secretKey) {
      return this.getMockResult();
    }

    const ocrTexts = await this.callTencentOcrBase64(base64Data, secretId, secretKey, this.configService.get<string>('ocr.region'));
    const items = this.parser.parse(ocrTexts);
    return this.enrichWithCatalog(items);
  }

  /**
   * 用参考库丰富 OCR 解析结果
   * 匹配策略：优先精确匹配名称（score=1.0），其次高阈值模糊匹配（>=0.8）
   * 部位(category)、等级、品质、装等等属性全部从参考库带出
   */
  async enrichWithCatalog(items: ParsedEquipment[]): Promise<ParsedEquipment[]> {
    const enriched: ParsedEquipment[] = [];
    for (const item of items) {
      try {
        // 使用较高阈值 0.8 进行匹配，确保高准确率
        const matches = await this.catalogService.findByNameFuzzy(item.name, 0.8);
        if (matches.length > 0) {
          // 优先选择完全精确匹配（score=1.0）的结果
          let best = matches[0];

          // 如果有多个匹配，优先选 score=1.0 且等级/品质也匹配的
          if (matches.length > 1) {
            const exactMatch = matches.find(m =>
              m.score === 1.0 &&
              (!item.level || m.item.level === item.level) &&
              (item.quality === undefined || m.item.quality === item.quality)
            );
            if (exactMatch) best = exactMatch;
            else {
              // 其次选 score=1.0 的
              const nameExact = matches.find(m => m.score === 1.0);
              if (nameExact) best = nameExact;
            }
          }

          // 所有属性从参考库带出（参考库数据优先）
          enriched.push({
            ...item,
            catalogId: best.item.id,
            catalogName: best.item.name,
            matchScore: best.score,
            category: best.item.category,
            level: best.item.level,
            quality: best.item.quality,
            gearScore: best.item.gearScore,
          });
        } else {
          enriched.push({ ...item, matchScore: 0 });
        }
      } catch {
        enriched.push(item);
      }
    }
    return enriched;
  }

  private async callTencentOcr(imageUrl: string, secretId: string, secretKey: string, region: string): Promise<string[]> {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const host = 'ocr.tencentcloudapi.com';
    const payload = JSON.stringify({ ImageUrl: imageUrl });

    const headers = {
      'Content-Type': 'application/json', Host: host,
      'X-TC-Action': 'GeneralBasicOCR', 'X-TC-Version': '2018-11-19',
      'X-TC-Region': region, 'X-TC-Timestamp': String(timestamp),
      Authorization: await this.generateAuth(secretId, secretKey, 'ocr', date, timestamp, payload, host),
    };

    const response = await fetch(`https://${host}`, { method: 'POST', headers, body: payload });
    const result = await response.json() as any;
    return result.Response?.TextDetections?.map((t: any) => t.DetectedText) || [];
  }

  private async callTencentOcrBase64(base64: string, secretId: string, secretKey: string, region: string): Promise<string[]> {
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const host = 'ocr.tencentcloudapi.com';
    const payload = JSON.stringify({ ImageBase64: base64 });

    const headers = {
      'Content-Type': 'application/json', Host: host,
      'X-TC-Action': 'GeneralBasicOCR', 'X-TC-Version': '2018-11-19',
      'X-TC-Region': region, 'X-TC-Timestamp': String(timestamp),
      Authorization: await this.generateAuth(secretId, secretKey, 'ocr', date, timestamp, payload, host),
    };

    const response = await fetch(`https://${host}`, { method: 'POST', headers, body: payload });
    const result = await response.json() as any;
    return result.Response?.TextDetections?.map((t: any) => t.DetectedText) || [];
  }

  private async generateAuth(secretId: string, secretKey: string, service: string, date: string, timestamp: number, payload: string, host: string): Promise<string> {
    const crypto = await import('crypto');
    const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
    const canonicalRequest = `POST\n/\n\ncontent-type:application/json\nhost:${host}\n\ncontent-type;host\n${hashedPayload}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const hashedCR = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCR}`;
    const hmac = (key: Buffer | string, data: string) => crypto.createHmac('sha256', key).update(data).digest();
    const signature = crypto.createHmac('sha256', hmac(hmac(hmac(`TC3${secretKey}`, date), service), 'tc3_request')).update(stringToSign).digest('hex');
    return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host, Signature=${signature}`;
  }

  private getMockResult(): ParsedEquipment[] {
    return [
      { name: '堕神奶杖', quantity: 5, confidence: 0.8 },
      { name: '挣脱鞋', quantity: 3, confidence: 0.65 },
      { name: '冰箱头', quantity: 2, confidence: 0.8 },
    ];
  }
}

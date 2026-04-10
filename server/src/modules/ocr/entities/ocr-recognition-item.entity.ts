import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { OcrRecognitionBatch } from './ocr-recognition-batch.entity';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('ocr_recognition_item')
export class OcrRecognitionItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'batch_id', comment: '关联批次ID' })
  batchId: number;

  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'equipment_name', comment: '识别出的装备名称' })
  equipmentName: string;

  @Column({ type: 'int', nullable: true, name: 'matched_catalog_id', comment: '匹配到的参考库装备ID' })
  matchedCatalogId: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'matched_catalog_name', comment: '匹配到的参考库装备名称' })
  matchedCatalogName: string;

  @Column({ type: 'int', nullable: true, comment: '识别出的等级 1~8' })
  level: number;

  @Column({ type: 'int', nullable: true, comment: '识别出的品质 0~4' })
  quality: number;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '识别出的部位' })
  category: string;

  @Column({ type: 'int', nullable: true, name: 'gear_score', comment: '识别出的装等' })
  gearScore: number;

  @Column({ type: 'int', default: 1, comment: '识别出的数量' })
  quantity: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, comment: '匹配置信度(0-100%)' })
  confidence: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'crop_image_url', comment: '装备切图URL' })
  cropImageUrl: string;

  @Column({ type: 'text', nullable: true, name: 'ocr_raw_text', comment: 'OCR原始识别文本' })
  ocrRawText: string;

  @Column({ type: 'varchar', length: 20, default: 'pending', comment: '状态: pending/confirmed/discarded/saved' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'confirmed_name', comment: '人工确认后的装备名称' })
  confirmedName: string;

  @Column({ type: 'int', nullable: true, name: 'confirmed_catalog_id', comment: '人工确认后的参考库ID' })
  confirmedCatalogId: number;

  @Column({ type: 'int', nullable: true, name: 'confirmed_level', comment: '人工确认后的等级' })
  confirmedLevel: number;

  @Column({ type: 'int', nullable: true, name: 'confirmed_quality', comment: '人工确认后的品质' })
  confirmedQuality: number;

  @Column({ type: 'int', nullable: true, name: 'confirmed_quantity', comment: '人工确认后的数量' })
  confirmedQuantity: number;

  @Column({ type: 'int', nullable: true, name: 'position_x', comment: '在原图中的X坐标' })
  positionX: number;

  @Column({ type: 'int', nullable: true, name: 'position_y', comment: '在原图中的Y坐标' })
  positionY: number;

  @Column({ type: 'int', nullable: true, name: 'position_width', comment: '识别区域宽度' })
  positionWidth: number;

  @Column({ type: 'int', nullable: true, name: 'position_height', comment: '识别区域高度' })
  positionHeight: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => OcrRecognitionBatch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batch_id' })
  batch: OcrRecognitionBatch;

  @ManyToOne(() => Guild, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EquipmentCatalog } from './equipment-catalog.entity';

@Entity('equipment_images')
export class EquipmentImage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'catalog_id', comment: '关联装备参考库ID' })
  catalogId: number;

  @Column({ type: 'varchar', length: 500, name: 'image_url', comment: '图片URL' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'icon', name: 'image_type', comment: '图片类型: icon/screenshot/template' })
  imageType: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'file_name', comment: '原始文件名' })
  fileName: string;

  @Column({ type: 'int', nullable: true, name: 'file_size', comment: '文件大小(bytes)' })
  fileSize: number;

  @Column({ type: 'int', nullable: true, comment: '图片宽度(px)' })
  width: number;

  @Column({ type: 'int', nullable: true, comment: '图片高度(px)' })
  height: number;

  @Column({ type: 'tinyint', default: 0, name: 'is_primary', comment: '是否主图' })
  isPrimary: number;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序' })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => EquipmentCatalog, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'catalog_id' })
  catalog: EquipmentCatalog;
}

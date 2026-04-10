import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('equipment_catalog')
@Index('uk_catalog_unique', ['name', 'level', 'quality', 'category'], { unique: true })
export class EquipmentCatalog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_catalog_name')
  @Column({ type: 'varchar', length: 100, comment: '装备名称' })
  name: string;

  @Column({ type: 'int', default: 1, comment: '等级 1~8' })
  level: number;

  @Column({ type: 'int', default: 0, comment: '品质 0~4' })
  quality: number;

  @Index('idx_catalog_category')
  @Column({ type: 'varchar', length: 20, default: '其他', comment: '部位' })
  category: string;

  @Index('idx_catalog_gear_score')
  @Column({ type: 'int', default: 0, name: 'gear_score', comment: '装等=等级+品质' })
  gearScore: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url', comment: '参考图' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '描述' })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

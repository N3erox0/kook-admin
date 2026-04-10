import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('equipment_inventory')
@Index('uk_equipment_unique', ['name', 'level', 'quality', 'slot'], { unique: true })
export class EquipmentInventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_equipment_name')
  @Column({ type: 'varchar', length: 100, comment: '装备名称' })
  name: string;

  @Column({ type: 'int', default: 1, comment: '等级 1~8' })
  level: number;

  @Column({ type: 'int', default: 0, comment: '品质 0~4' })
  quality: number;

  @Index('idx_equipment_gear_score')
  @Column({ type: 'int', default: 0, name: 'gear_score', comment: '装等(=等级+品质，可手动覆盖)' })
  gearScore: number;

  @Index('idx_equipment_slot')
  @Column({ type: 'varchar', length: 20, default: '其他', comment: '部位: 武器/头/甲/鞋/副手/披风/坐骑/其他' })
  slot: string;

  @Column({ type: 'varchar', length: 50, default: '公会仓库', comment: '所在位置' })
  location: string;

  @Column({ type: 'int', default: 1, comment: '数量' })
  quantity: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url', comment: '参考图URL' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

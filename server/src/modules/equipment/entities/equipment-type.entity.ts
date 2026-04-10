import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('equipment_types')
export class EquipmentType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, comment: '装备类型名称' })
  name: string;

  @Column({ type: 'varchar', length: 30, unique: true, comment: '类型编码' })
  code: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '图标' })
  icon: string;

  @Column({ type: 'int', default: 0, name: 'sort_order', comment: '排序' })
  sortOrder: number;

  @Column({ type: 'tinyint', default: 1, comment: '状态' })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

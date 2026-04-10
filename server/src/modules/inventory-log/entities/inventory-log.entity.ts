import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('inventory_logs')
export class InventoryLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_invlog_guild')
  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Index('idx_invlog_inventory')
  @Column({ name: 'inventory_id', nullable: true, comment: '关联库存记录ID' })
  inventoryId: number;

  @Index('idx_invlog_catalog')
  @Column({ name: 'catalog_id', nullable: true, comment: '关联装备参考库ID' })
  catalogId: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'equipment_name', comment: '装备名称（冗余，方便查询）' })
  equipmentName: string;

  @Index('idx_invlog_action')
  @Column({ type: 'varchar', length: 30, comment: '操作类型: manual_add/manual_edit/csv_import/ocr_import/resupply_deduct/delete' })
  action: string;

  @Column({ type: 'int', default: 0, comment: '变动量（正=增加，负=减少）' })
  delta: number;

  @Column({ type: 'int', default: 0, name: 'before_quantity', comment: '变动前数量' })
  beforeQuantity: number;

  @Column({ type: 'int', default: 0, name: 'after_quantity', comment: '变动后数量' })
  afterQuantity: number;

  @Column({ name: 'operator_id', nullable: true, comment: '操作人ID' })
  operatorId: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'operator_name', comment: '操作人名称' })
  operatorName: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @Index('idx_invlog_created')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

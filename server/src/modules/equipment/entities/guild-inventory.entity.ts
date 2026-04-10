import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';
import { EquipmentCatalog } from '../../equipment-catalog/entities/equipment-catalog.entity';

@Entity('guild_inventory')
@Index('uk_guild_catalog', ['guildId', 'catalogId'], { unique: true })
export class GuildInventory {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_gi_guild')
  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Index('idx_gi_catalog')
  @Column({ name: 'catalog_id', comment: '关联装备参考库' })
  catalogId: number;

  @Column({ type: 'int', default: 0, comment: '数量' })
  quantity: number;

  @Column({ type: 'varchar', length: 50, default: '公会仓库', comment: '所在位置' })
  location: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @Column({ type: 'tinyint', default: 0, name: 'is_counted', comment: '是否已统计（预警推送后标记）' })
  isCounted: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;

  @ManyToOne(() => EquipmentCatalog)
  @JoinColumn({ name: 'catalog_id' })
  catalog: EquipmentCatalog;
}

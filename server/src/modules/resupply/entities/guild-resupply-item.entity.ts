import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { GuildResupply } from './guild-resupply.entity';

@Entity('guild_resupply_items')
export class GuildResupplyItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_gri_resupply')
  @Column({ name: 'resupply_id', comment: '补装申请ID' })
  resupplyId: number;

  @Index('idx_gri_catalog')
  @Column({ name: 'catalog_id', nullable: true, comment: '装备参考库ID' })
  catalogId: number;

  @Index('idx_gri_albion')
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'albion_id',
    comment: 'Albion装备唯一ID',
  })
  albionId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'equipment_name',
    comment: '装备显示名',
  })
  equipmentName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '部位' })
  slot: string;

  @Column({ type: 'int', nullable: true, comment: '等级 1~8' })
  level: number;

  @Column({
    type: 'int',
    nullable: true,
    name: 'enchant_level',
    comment: '附魔/宝石点数 0~4',
  })
  enchantLevel: number;

  @Column({
    type: 'tinyint',
    default: 0,
    name: 'item_quality',
    comment: '装备边框品质 0无/1普通/2良好/3优秀/4杰出/5不凡',
  })
  itemQuality: number;

  @Column({ type: 'int', default: 1, comment: '数量' })
  quantity: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'killboard',
    comment: '来源 killboard/manual/ocr',
  })
  source: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'matched',
    name: 'match_status',
    comment: '匹配状态 matched/unmatched/manual',
  })
  matchStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => GuildResupply, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resupply_id' })
  resupply: GuildResupply;
}

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('guild_alert_rules')
export class GuildAlertRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ type: 'varchar', length: 2, default: '01', name: 'rule_type', comment: '规则类型: 01补装库存预警 / 02死亡次数预警' })
  ruleType: string;

  @Column({ type: 'varchar', length: 100, name: 'rule_name', comment: '规则名称' })
  ruleName: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'equipment_name', comment: '装备名称' })
  equipmentName: string;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'gear_score', comment: '装等值（如P4-P8, P9, P12）' })
  gearScoreValue: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '部位' })
  category: string;

  @Column({ type: 'int', nullable: true, name: 'gear_score_min' })
  gearScoreMin: number;

  @Column({ type: 'int', nullable: true, name: 'gear_score_max' })
  gearScoreMax: number;

  @Column({ type: 'int', comment: '预警阈值' })
  threshold: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  enabled: number;

  @Column({ name: 'created_by', nullable: true })
  createdBy: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

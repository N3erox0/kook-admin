import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('guild_alert_records')
export class GuildAlertRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ name: 'rule_id', nullable: true })
  ruleId: number;

  @Column({ type: 'varchar', length: 50, default: 'below', name: 'alert_type' })
  alertType: string;

  @Column({ type: 'varchar', length: 500 })
  message: string;

  @Column({ type: 'int', name: 'current_value' })
  currentValue: number;

  @Column({ type: 'int', name: 'threshold_value' })
  thresholdValue: number;

  @Column({ type: 'tinyint', default: 0, name: 'is_resolved' })
  isResolved: number;

  @Column({ type: 'datetime', nullable: true, name: 'resolved_at' })
  resolvedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

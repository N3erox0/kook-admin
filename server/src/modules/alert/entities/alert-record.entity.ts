import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { AlertRule } from './alert-rule.entity';

@Entity('alert_records')
export class AlertRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'rule_id', comment: '关联规则' })
  ruleId: number;

  @Column({ type: 'varchar', length: 50, name: 'alert_type', comment: '预警类型' })
  alertType: string;

  @Column({ type: 'varchar', length: 500, comment: '预警消息' })
  message: string;

  @Column({ type: 'int', name: 'current_value', comment: '当前值' })
  currentValue: number;

  @Column({ type: 'int', name: 'threshold_value', comment: '阈值' })
  thresholdValue: number;

  @Index('idx_alert_resolved')
  @Column({ type: 'tinyint', default: 0, name: 'is_resolved', comment: '是否已解决' })
  isResolved: number;

  @Column({ type: 'datetime', nullable: true, name: 'resolved_at', comment: '解决时间' })
  resolvedAt: Date;

  @Index('idx_alert_created')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => AlertRule)
  @JoinColumn({ name: 'rule_id' })
  rule: AlertRule;
}

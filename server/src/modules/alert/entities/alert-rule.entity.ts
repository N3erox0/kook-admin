import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('alert_rules')
export class AlertRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, name: 'rule_name', comment: '规则名称' })
  ruleName: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'equipment_name', comment: '装备名称（可选）' })
  equipmentName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '部位（可选）' })
  slot: string;

  @Column({ type: 'int', nullable: true, name: 'gear_score_min', comment: '装等下限（可选）' })
  gearScoreMin: number;

  @Column({ type: 'int', nullable: true, name: 'gear_score_max', comment: '装等上限（可选）' })
  gearScoreMax: number;

  @Column({ type: 'varchar', length: 20, default: 'below', name: 'condition_type', comment: '条件类型（固定below）' })
  conditionType: string;

  @Column({ type: 'int', comment: '阈值（库存低于此值触发预警）' })
  threshold: number;

  @Column({ type: 'tinyint', default: 1, comment: '是否启用' })
  enabled: number;

  @Column({ name: 'created_by', nullable: true, comment: '创建人' })
  createdBy: number;

  // 旧字段保留兼容
  @Column({ name: 'equipment_type_id', nullable: true, comment: '旧装备类型ID（已废弃）' })
  equipmentTypeId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

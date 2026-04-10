import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('scheduled_tasks')
export class ScheduledTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, name: 'task_name', comment: '任务名称' })
  taskName: string;

  @Column({ type: 'varchar', length: 50, name: 'cron_expression', comment: 'CRON表达式' })
  cronExpression: string;

  @Column({ type: 'tinyint', default: 1, comment: '状态' })
  status: number;

  @Column({ type: 'datetime', nullable: true, name: 'last_run_at', comment: '上次执行时间' })
  lastRunAt: Date;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'last_run_result', comment: '上次执行结果' })
  lastRunResult: string;

  @Column({ type: 'int', nullable: true, name: 'duration_ms', comment: '执行耗时ms' })
  durationMs: number;

  @Column({ type: 'datetime', nullable: true, name: 'next_run_at', comment: '下次执行时间' })
  nextRunAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

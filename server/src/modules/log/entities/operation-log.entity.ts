import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('operation_logs')
export class OperationLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_logs_user')
  @Column({ name: 'user_id', nullable: true, comment: '操作人' })
  userId: number;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '操作人名称' })
  username: string;

  @Index('idx_logs_module_action', { synchronize: false })
  @Column({ type: 'varchar', length: 50, comment: '模块' })
  module: string;

  @Column({ type: 'varchar', length: 50, comment: '操作类型' })
  action: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'target_type', comment: '目标类型' })
  targetType: string;

  @Column({ type: 'int', nullable: true, name: 'target_id', comment: '目标ID' })
  targetId: number;

  @Column({ type: 'json', nullable: true, name: 'request_params', comment: '请求参数' })
  requestParams: any;

  @Column({ type: 'int', nullable: true, name: 'response_status', comment: '响应状态' })
  responseStatus: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'ip_address', comment: 'IP地址' })
  ipAddress: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'user_agent', comment: '浏览器UA' })
  userAgent: string;

  @Column({ type: 'json', nullable: true, name: 'before_snapshot', comment: '操作前快照' })
  beforeSnapshot: any;

  @Column({ type: 'json', nullable: true, name: 'after_snapshot', comment: '操作后快照' })
  afterSnapshot: any;

  @Index('idx_logs_created')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

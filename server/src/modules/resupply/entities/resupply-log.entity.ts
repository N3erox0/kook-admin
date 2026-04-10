import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ResupplyRequest } from './resupply-request.entity';

@Entity('resupply_logs')
export class ResupplyLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'request_id', comment: '关联申请' })
  requestId: number;

  @Column({ type: 'varchar', length: 50, comment: '操作类型' })
  action: string;

  @Column({ name: 'operator_id', nullable: true, comment: '操作人ID' })
  operatorId: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'operator_name', comment: '操作人名称' })
  operatorName: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  remark: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'from_status', comment: '原状态' })
  fromStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'to_status', comment: '目标状态' })
  toStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => ResupplyRequest)
  @JoinColumn({ name: 'request_id' })
  request: ResupplyRequest;
}

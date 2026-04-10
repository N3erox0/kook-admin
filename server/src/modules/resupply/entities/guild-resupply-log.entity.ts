import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { GuildResupply } from './guild-resupply.entity';

@Entity('guild_resupply_logs')
export class GuildResupplyLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ name: 'resupply_id', comment: '关联补装申请' })
  resupplyId: number;

  @Column({ type: 'varchar', length: 50, comment: '操作: create/approve/reject/dispatch' })
  action: string;

  @Column({ name: 'operator_id', nullable: true })
  operatorId: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'operator_name' })
  operatorName: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'from_status' })
  fromStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'to_status' })
  toStatus: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => GuildResupply)
  @JoinColumn({ name: 'resupply_id' })
  resupply: GuildResupply;
}

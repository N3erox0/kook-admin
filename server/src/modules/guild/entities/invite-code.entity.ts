import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('invite_codes')
export class InviteCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true, comment: '邀请码' })
  code: string;

  @Column({ type: 'varchar', length: 10, default: 'disabled', comment: '状态: enabled/used/disabled/revoked' })
  status: string;

  @Column({ name: 'used_by_user_id', nullable: true, comment: '使用人ID' })
  usedByUserId: number;

  @Column({ type: 'int', nullable: true, name: 'bound_guild_id', comment: '绑定的公会ID' })
  boundGuildId: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'bound_guild_name', comment: '绑定的公会名称' })
  boundGuildName: string;

  @Column({ type: 'datetime', nullable: true, name: 'used_at', comment: '使用时间' })
  usedAt: Date;

  @Column({ name: 'created_by', nullable: true, comment: '创建人ID' })
  createdBy: number;

  @Column({ type: 'varchar', length: 10, default: '01', name: 'create_source', comment: '创建途径: 01系统手动 02BOT自动' })
  createSource: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '备注' })
  remark: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

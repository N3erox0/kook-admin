import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('members')
export class Member {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_members_kook_user_id')
  @Column({ type: 'varchar', length: 50, name: 'kook_user_id', unique: true, comment: 'KOOK用户ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 100, comment: 'KOOK用户名' })
  username: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '服务器昵称(kook nickid)' })
  nickname: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像URL' })
  avatar: string;

  @Column({ type: 'json', nullable: true, name: 'kook_roles', comment: 'KOOK服务器角色JSON' })
  kookRoles: string;

  @Index('idx_members_status')
  @Column({ type: 'varchar', length: 10, default: 'normal', comment: '成员状态: normal正常 new新增 left已离开' })
  status: string;

  @Index('idx_members_joined')
  @Column({ type: 'datetime', nullable: true, name: 'joined_at', comment: '加入时间' })
  joinedAt: Date;

  @Index('idx_members_left')
  @Column({ type: 'datetime', nullable: true, name: 'left_at', comment: '离开时间' })
  leftAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'last_synced_at', comment: '最后同步时间' })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

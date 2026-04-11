import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('guild_members')
@Index('uk_guild_kook_user', ['guildId', 'kookUserId'], { unique: true })
export class GuildMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_gm_guild')
  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ name: 'user_id', nullable: true, comment: '关联系统用户' })
  userId: number;

  @Column({ type: 'varchar', length: 50, name: 'kook_user_id', comment: 'KOOK用户ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '服务器昵称' })
  nickname: string;

  @Column({ type: 'json', nullable: true, name: 'kook_roles', comment: 'KOOK服务器角色' })
  kookRoles: any;

  @Index('idx_gm_role')
  @Column({ type: 'varchar', length: 20, default: 'normal', comment: '管理角色' })
  role: string;

  @Index('idx_gm_status')
  @Column({ type: 'varchar', length: 10, default: 'active', comment: '成员状态: active/left' })
  status: string;

  @Index('idx_gm_joined')
  @Column({ type: 'datetime', nullable: true, name: 'joined_at', comment: '加入时间' })
  joinedAt: Date;

  @Index('idx_gm_left')
  @Column({ type: 'datetime', nullable: true, name: 'left_at', comment: '离开时间' })
  leftAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'last_synced_at', comment: '最后同步时间' })
  lastSyncedAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'kook_sync', name: 'join_source', comment: '加入方式: kook_sync/invite_link/manual/webhook' })
  joinSource: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('bot_join_records')
export class BotJoinRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('uk_bjr_guild_id', { unique: true })
  @Column({ type: 'varchar', length: 50, name: 'guild_id', comment: 'KOOK服务器ID' })
  kookGuildId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'guild_name', comment: '服务器名称' })
  guildName: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'guild_icon', comment: '服务器图标' })
  guildIcon: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'inviter_kook_id', comment: '邀请人KOOK ID（服务器主）' })
  inviterKookId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'inviter_username', comment: '邀请人用户名' })
  inviterUsername: string;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'inviter_identify_num', comment: '邀请人识别号' })
  inviterIdentifyNum: string;

  @Column({ type: 'varchar', length: 20, default: 'pending', comment: '状态: pending/activated/left' })
  status: string;

  @Column({ type: 'int', nullable: true, name: 'invite_code_id', comment: '关联的邀请码ID' })
  inviteCodeId: number;

  @Column({ type: 'int', nullable: true, name: 'guild_member_count', comment: '服务器成员数' })
  guildMemberCount: number;

  @Column({ type: 'datetime', name: 'joined_at', comment: 'Bot加入时间' })
  joinedAt: Date;

  @Column({ type: 'datetime', nullable: true, name: 'activated_at', comment: '激活时间' })
  activatedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

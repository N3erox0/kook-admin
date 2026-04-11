import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('guilds')
export class Guild {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true, comment: '公会名称' })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'icon_url', comment: '公会图标URL' })
  iconUrl: string;

  @Column({ type: 'varchar', length: 50, unique: true, name: 'kook_guild_id', comment: 'KOOK服务器ID' })
  kookGuildId: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'kook_bot_token', comment: 'KOOK Bot Token' })
  kookBotToken: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_verify_token', comment: 'KOOK Verify Token' })
  kookVerifyToken: string;

  @Column({ type: 'tinyint', default: 0, name: 'kook_webhook_enabled', comment: 'Webhook是否启用' })
  kookWebhookEnabled: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_resupply_channel_id', comment: '补装监听频道' })
  kookResupplyChannelId: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_admin_channel_id', comment: '管理通知频道' })
  kookAdminChannelId: string;

  @Column({ type: 'json', nullable: true, name: 'kook_listen_channel_ids', comment: '监听的频道ID列表' })
  kookListenChannelIds: string[];

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_admin_role_id', comment: '管理员角色ID' })
  kookAdminRoleId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_last_message_id', comment: '消息拉取游标' })
  kookLastMessageId: string;

  @Column({ name: 'owner_user_id', nullable: true, comment: '创建人（激活后填入）' })
  ownerUserId: number;

  @Column({ name: 'invite_code_id', nullable: true, comment: '使用的邀请码' })
  inviteCodeId: number;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true, name: 'activation_code', comment: '一次性激活码（joined_guild时生成）' })
  activationCode: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'invited_by_kook_user_id', comment: '邀请人KOOK用户ID' })
  invitedByKookUserId: string;

  @Column({ type: 'tinyint', default: 0, comment: '状态: 0=pending_activation 1=active 2=disabled' })
  status: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_user_id' })
  owner: User;
}

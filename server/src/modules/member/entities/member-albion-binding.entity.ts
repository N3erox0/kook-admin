import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('member_albion_bindings')
@Index('uk_mab_guild_player', ['guildId', 'albionPlayerId'], { unique: true })
export class MemberAlbionBinding {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_mab_guild')
  @Column({ name: 'guild_id', comment: '系统公会ID' })
  guildId: number;

  @Index('idx_mab_member')
  @Column({ name: 'guild_member_id', nullable: true, comment: 'KOOK成员表ID' })
  guildMemberId: number;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    name: 'kook_user_id',
    comment: 'KOOK用户ID',
  })
  kookUserId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'kook_nickname',
    comment: 'KOOK昵称',
  })
  kookNickname: string;

  @Index('idx_mab_albion_player')
  @Column({
    type: 'varchar',
    length: 80,
    name: 'albion_player_id',
    comment: 'Albion玩家ID',
  })
  albionPlayerId: string;

  @Column({
    type: 'varchar',
    length: 100,
    name: 'albion_player_name',
    comment: 'Albion玩家名',
  })
  albionPlayerName: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'manual',
    name: 'bind_type',
    comment: '绑定方式 auto/manual',
  })
  bindType: string;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'active',
    comment: '绑定状态 active/disabled',
  })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

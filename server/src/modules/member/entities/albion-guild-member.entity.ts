import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('albion_guild_members')
@Index('uk_agm_guild_player', ['guildId', 'playerId'], { unique: true })
export class AlbionGuildMember {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_agm_guild')
  @Column({ name: 'guild_id', comment: '系统公会ID' })
  guildId: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'sgp',
    name: 'albion_server',
    comment: 'Albion服务器: west/east/sgp/ams',
  })
  albionServer: string;

  @Column({
    type: 'varchar',
    length: 80,
    name: 'albion_guild_id',
    comment: 'Albion公会ID',
  })
  albionGuildId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'albion_guild_name',
    comment: 'Albion公会名称',
  })
  albionGuildName: string;

  @Index('idx_agm_player')
  @Column({
    type: 'varchar',
    length: 80,
    name: 'player_id',
    comment: 'Albion玩家ID',
  })
  playerId: string;

  @Index('idx_agm_name')
  @Column({
    type: 'varchar',
    length: 100,
    name: 'player_name',
    comment: 'Albion玩家名',
  })
  playerName: string;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
    name: 'alliance_id',
    comment: '联盟ID',
  })
  allianceId: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    name: 'alliance_name',
    comment: '联盟名称',
  })
  allianceName: string;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'kill_fame',
    comment: '击杀声望',
  })
  killFame: number;

  @Column({
    type: 'bigint',
    default: 0,
    name: 'death_fame',
    comment: '死亡声望',
  })
  deathFame: number;

  @Index('idx_agm_status')
  @Column({
    type: 'varchar',
    length: 10,
    default: 'active',
    comment: '状态 active/left',
  })
  status: string;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'joined_at',
    comment: '首次同步/加入时间',
  })
  joinedAt: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'left_at',
    comment: '离开时间',
  })
  leftAt: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    name: 'last_synced_at',
    comment: '最后同步时间',
  })
  lastSyncedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

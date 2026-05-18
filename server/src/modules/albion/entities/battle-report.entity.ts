import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('battle_reports')
@Index(['guildId', 'deathTime'])
@Index(['guildId', 'memberName'])
@Index(['albionEventId'], { unique: true })
export class BattleReport {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'guild_id' })
  guildId: number;

  @Column({ name: 'member_name', length: 100, comment: '死亡成员游戏名' })
  memberName: string;

  @Column({ name: 'albion_player_id', length: 100, nullable: true, comment: 'Albion 玩家ID' })
  albionPlayerId: string;

  @Column({ name: 'albion_event_id', type: 'bigint', comment: 'Albion 事件ID（去重用）' })
  albionEventId: number;

  @Column({ name: 'battle_id', type: 'bigint', nullable: true, comment: '战斗ID' })
  battleId: number;

  @Column({ name: 'death_time', type: 'datetime', comment: '死亡时间' })
  deathTime: Date;

  @Column({ name: 'death_map', length: 200, nullable: true, comment: '死亡地图' })
  deathMap: string;

  @Column({ name: 'killer_name', length: 100, nullable: true, comment: '击杀者名称' })
  killerName: string;

  @Column({ name: 'killer_guild', length: 100, nullable: true, comment: '击杀者公会' })
  killerGuild: string;

  @Column({ name: 'equipment_list', type: 'json', nullable: true, comment: '死亡装备列表JSON' })
  equipmentList: {
    slot: string;
    albionId: string;
    name: string;
    level: number | null;
    enchantLevel: number | null;
    quality: number;
    catalogId: number | null;
  }[];

  @Column({ name: 'total_kill_fame', type: 'int', default: 0, comment: '击杀声望' })
  totalKillFame: number;

  @Column({ name: 'raw_event', type: 'json', nullable: true, comment: '原始API事件数据' })
  rawEvent: any;

  @Column({ name: 'matched_resupply', type: 'boolean', default: false, comment: '是否已匹配补装申请' })
  matchedResupply: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

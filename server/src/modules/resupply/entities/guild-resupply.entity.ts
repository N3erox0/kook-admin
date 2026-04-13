import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('guild_resupply')
export class GuildResupply {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_gr_guild')
  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ name: 'guild_member_id', nullable: true, comment: '关联公会成员' })
  guildMemberId: number;

  @Index('idx_gr_kook_user')
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_user_id', comment: '申请人KOOK ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_nickname', comment: '申请人昵称' })
  kookNickname: string;

  @Column({ type: 'varchar', length: 100, name: 'equipment_name', comment: '装备名称' })
  equipmentName: string;

  @Column({ type: 'int', nullable: true, comment: '等级 1~8' })
  level: number;

  @Column({ type: 'int', nullable: true, comment: '品质 0~4' })
  quality: number;

  @Column({ type: 'int', nullable: true, name: 'gear_score', comment: '装等' })
  gearScore: number;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '部位' })
  category: string;

  @Column({ type: 'int', default: 1, comment: '申请数量' })
  quantity: number;

  @Column({ type: 'varchar', length: 30, default: '补装', name: 'apply_type', comment: '申请类型' })
  applyType: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  reason: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'screenshot_url', comment: '截图' })
  screenshotUrl: string;

  @Index('idx_gr_status')
  @Column({ type: 'tinyint', default: 0, comment: '0待处理 1已通过 2已驳回 3已发放' })
  status: number;

  @Column({ name: 'processed_by', nullable: true, comment: '处理人' })
  processedBy: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'process_remark', comment: '处理备注' })
  processRemark: string;

  @Column({ type: 'datetime', nullable: true, name: 'processed_at' })
  processedAt: Date;

  @Column({ name: 'dispatched_by', nullable: true, comment: '发放人' })
  dispatchedBy: number;

  @Column({ type: 'datetime', nullable: true, name: 'dispatched_at' })
  dispatchedAt: Date;

  @Column({ type: 'int', nullable: true, name: 'dispatch_quantity', comment: '实际发放数量' })
  dispatchQuantity: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_message_id', comment: 'KOOK消息ID' })
  kookMessageId: string;

  @Column({ type: 'tinyint', default: 0, name: 'is_counted', comment: '是否已统计（预警推送后标记）' })
  isCounted: number;

  @Column({ type: 'varchar', length: 64, nullable: true, name: 'dedup_hash', comment: '去重哈希（图片+日期+人员）' })
  dedupHash: string;

  @Column({ type: 'varchar', length: 30, nullable: true, name: 'resupply_box', comment: '补装箱子编号（如 3-16, 大厅32）' })
  resupplyBox: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'resupply_room', comment: '补装房间（如 1-14, 大厅一, 大厅二）' })
  resupplyRoom: string;

  @Column({ type: 'varchar', length: 10, nullable: true, name: 'kill_date', comment: '击杀日期 YYYY-MM-DD' })
  killDate: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'map_name', comment: '地图名称' })
  mapName: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'game_id', comment: '游戏ID' })
  gameId: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'guild_name', comment: '公会名（OCR识别）' })
  ocrGuildName: string;

  @Index('idx_gr_created')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Guild)
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

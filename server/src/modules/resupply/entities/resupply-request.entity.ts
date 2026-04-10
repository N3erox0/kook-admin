import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Member } from '../../member/entities/member.entity';
import { User } from '../../user/entities/user.entity';

@Entity('resupply_requests')
export class ResupplyRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('idx_resupply_member')
  @Column({ name: 'member_id', nullable: true, comment: '关联成员（可为空，KOOK消息可能无法匹配）' })
  memberId: number;

  @Index('idx_resupply_kook_user')
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_user_id', comment: '申请人KOOK ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_nickname', comment: '申请人KOOK昵称' })
  kookNickname: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'kook_roles', comment: '申请人服务器角色' })
  kookRoles: string;

  @Column({ type: 'varchar', length: 100, name: 'equipment_name', comment: '装备名称' })
  equipmentName: string;

  @Column({ type: 'int', nullable: true, comment: '装备等级 1~8' })
  level: number;

  @Column({ type: 'int', nullable: true, comment: '装备品质 0~4' })
  quality: number;

  @Column({ type: 'int', nullable: true, name: 'gear_score', comment: '装等' })
  gearScore: number;

  @Column({ type: 'varchar', length: 20, nullable: true, comment: '装备部位' })
  slot: string;

  @Column({ type: 'int', default: 1, comment: '申请数量' })
  quantity: number;

  @Column({ type: 'varchar', length: 30, default: '补装', name: 'apply_type', comment: '申请类型: 补装/OC碎/其他' })
  applyType: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: '备注' })
  reason: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'screenshot_url', comment: '截图凭证' })
  screenshotUrl: string;

  @Index('idx_resupply_status')
  @Column({ type: 'tinyint', default: 0, comment: '状态 0待处理 1已通过 2已驳回 3已发放' })
  status: number;

  @Column({ name: 'processed_by', nullable: true, comment: '处理人（通过/驳回）' })
  processedBy: number;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'process_remark', comment: '处理备注/驳回原因' })
  processRemark: string;

  @Column({ type: 'datetime', nullable: true, name: 'processed_at', comment: '处理时间' })
  processedAt: Date;

  @Column({ name: 'dispatched_by', nullable: true, comment: '发放人' })
  dispatchedBy: number;

  @Column({ type: 'datetime', nullable: true, name: 'dispatched_at', comment: '发放时间' })
  dispatchedAt: Date;

  @Column({ type: 'int', nullable: true, name: 'dispatch_quantity', comment: '实际发放数量' })
  dispatchQuantity: number;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_message_id', unique: true, comment: 'KOOK消息ID（去重）' })
  kookMessageId: string;

  // 旧字段保留兼容
  @Column({ name: 'equipment_type_id', nullable: true, comment: '旧装备类型ID（已废弃）' })
  equipmentTypeId: number;

  @Index('idx_resupply_created')
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Member)
  @JoinColumn({ name: 'member_id' })
  member: Member;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'processed_by' })
  processor: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'dispatched_by' })
  dispatcher: User;
}

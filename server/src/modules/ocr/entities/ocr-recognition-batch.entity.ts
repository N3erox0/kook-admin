import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Guild } from '../../guild/entities/guild.entity';

@Entity('ocr_recognition_batch')
export class OcrRecognitionBatch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'guild_id', comment: '所属公会' })
  guildId: number;

  @Column({ type: 'varchar', length: 64, unique: true, name: 'batch_no', comment: '批次号' })
  batchNo: string;

  @Column({ type: 'varchar', length: 500, name: 'image_url', comment: '上传的图片URL' })
  imageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'inventory', name: 'image_type', comment: '图片类型: inventory/kill' })
  imageType: string;

  @Column({ type: 'varchar', length: 20, default: 'pending', comment: '状态: pending/recognized/confirmed/saved/failed' })
  status: string;

  @Column({ type: 'varchar', length: 20, default: 'manual', comment: '来源: manual/kook' })
  source: string;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'kook_user_id', comment: 'KOOK推送用户ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'kook_nickname', comment: 'KOOK推送用户昵称' })
  kookNickname: string;

  @Column({ type: 'int', default: 0, name: 'total_items', comment: '识别出的装备总数' })
  totalItems: number;

  @Column({ type: 'int', default: 0, name: 'confirmed_items', comment: '已确认的装备数' })
  confirmedItems: number;

  @Column({ type: 'int', default: 0, name: 'saved_items', comment: '已入库的装备数' })
  savedItems: number;

  @Column({ name: 'upload_user_id', nullable: true, comment: '上传人ID' })
  uploadUserId: number;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'upload_user_name', comment: '上传人名称' })
  uploadUserName: string;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'error_message', comment: '错误信息' })
  errorMessage: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Guild, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'guild_id' })
  guild: Guild;
}

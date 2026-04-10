import { Entity, Column, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('kook_config')
export class KookConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, unique: true, name: 'config_key', comment: '配置键' })
  configKey: string;

  @Column({ type: 'text', nullable: true, name: 'config_value', comment: '配置值' })
  configValue: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '描述' })
  description: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

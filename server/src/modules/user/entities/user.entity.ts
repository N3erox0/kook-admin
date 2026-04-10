import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, comment: '登录账号' })
  username: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash', comment: '密码哈希' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: '昵称' })
  nickname: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: '头像URL' })
  avatar: string;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: '邮箱' })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true, unique: true, name: 'kook_user_id', comment: 'KOOK用户ID' })
  kookUserId: string;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'global_role', comment: '全局角色: ssvip' })
  globalRole: string;

  @Column({ type: 'tinyint', default: 1, comment: '状态 0禁用 1启用' })
  status: number;

  @Column({ type: 'datetime', nullable: true, name: 'last_login_at', comment: '最后登录时间' })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

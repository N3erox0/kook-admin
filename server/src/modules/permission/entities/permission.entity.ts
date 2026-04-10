import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, comment: '模块标识' })
  module: string;

  @Column({ type: 'varchar', length: 50, comment: '操作标识' })
  action: string;

  @Column({ type: 'varchar', length: 50, name: 'display_name', comment: '权限名称' })
  displayName: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '描述' })
  description: string;
}

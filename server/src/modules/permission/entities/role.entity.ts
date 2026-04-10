import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, comment: '角色标识' })
  name: string;

  @Column({ type: 'varchar', length: 50, name: 'display_name', comment: '角色名称' })
  displayName: string;

  @Column({ type: 'varchar', length: 200, nullable: true, comment: '描述' })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

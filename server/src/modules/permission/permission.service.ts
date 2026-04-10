import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { UserRole } from './entities/user-role.entity';
import { RolePermission } from './entities/role-permission.entity';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, AssignRolesDto } from './dto/permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Role)
    private roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private permissionRepo: Repository<Permission>,
    @InjectRepository(UserRole)
    private userRoleRepo: Repository<UserRole>,
    @InjectRepository(RolePermission)
    private rolePermissionRepo: Repository<RolePermission>,
  ) {}

  // ========== 角色管理 ==========

  async findAllRoles() {
    return this.roleRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findRoleById(id: number) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    return role;
  }

  async createRole(dto: CreateRoleDto) {
    const exists = await this.roleRepo.findOne({ where: { name: dto.name } });
    if (exists) throw new ConflictException('角色标识已存在');
    const role = this.roleRepo.create(dto);
    return this.roleRepo.save(role);
  }

  async updateRole(id: number, dto: UpdateRoleDto) {
    const role = await this.findRoleById(id);
    Object.assign(role, dto);
    return this.roleRepo.save(role);
  }

  async deleteRole(id: number) {
    await this.findRoleById(id);
    await this.rolePermissionRepo.delete({ roleId: id });
    await this.userRoleRepo.delete({ roleId: id });
    await this.roleRepo.delete(id);
    return { message: '角色已删除' };
  }

  // ========== 权限管理 ==========

  async findAllPermissions() {
    return this.permissionRepo.find({ order: { module: 'ASC', action: 'ASC' } });
  }

  // ========== 角色-权限分配 ==========

  async getRolePermissions(roleId: number) {
    await this.findRoleById(roleId);
    const rps = await this.rolePermissionRepo.find({
      where: { roleId },
      relations: ['permission'],
    });
    return rps.map((rp) => rp.permission);
  }

  async assignPermissions(roleId: number, dto: AssignPermissionsDto) {
    await this.findRoleById(roleId);
    // 先删除旧权限
    await this.rolePermissionRepo.delete({ roleId });
    // 批量插入新权限
    const entities = dto.permissionIds.map((pid) =>
      this.rolePermissionRepo.create({ roleId, permissionId: pid }),
    );
    await this.rolePermissionRepo.save(entities);
    return { message: '权限分配成功' };
  }

  // ========== 用户-角色分配 ==========

  async getUserRoles(userId: number) {
    const urs = await this.userRoleRepo.find({
      where: { userId },
      relations: ['role'],
    });
    return urs.map((ur) => ur.role);
  }

  async assignUserRoles(dto: AssignRolesDto) {
    await this.userRoleRepo.delete({ userId: dto.userId });
    const entities = dto.roleIds.map((rid) =>
      this.userRoleRepo.create({ userId: dto.userId, roleId: rid }),
    );
    await this.userRoleRepo.save(entities);
    return { message: '角色分配成功' };
  }

  // ========== 权限校验 ==========

  async getUserPermissions(userId: number): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    if (!userRoles.length) return [];
    const roleIds = userRoles.map((ur) => ur.roleId);
    const rolePerms = await this.rolePermissionRepo.find({
      where: { roleId: In(roleIds) },
      relations: ['permission'],
    });
    return [...new Set(rolePerms.map((rp) => `${rp.permission.module}:${rp.permission.action}`))];
  }
}

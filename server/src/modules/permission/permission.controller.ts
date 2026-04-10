import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { CreateRoleDto, UpdateRoleDto, AssignPermissionsDto, AssignRolesDto } from './dto/permission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('api/permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  // ========== 角色 ==========

  @Get('roles')
  findAllRoles() {
    return this.permissionService.findAllRoles();
  }

  @Get('roles/:id')
  findRoleById(@Param('id', ParseIntPipe) id: number) {
    return this.permissionService.findRoleById(id);
  }

  @Post('roles')
  createRole(@Body() dto: CreateRoleDto) {
    return this.permissionService.createRole(dto);
  }

  @Put('roles/:id')
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.permissionService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  deleteRole(@Param('id', ParseIntPipe) id: number) {
    return this.permissionService.deleteRole(id);
  }

  // ========== 权限列表 ==========

  @Get()
  findAllPermissions() {
    return this.permissionService.findAllPermissions();
  }

  // ========== 角色权限分配 ==========

  @Get('roles/:id/permissions')
  getRolePermissions(@Param('id', ParseIntPipe) id: number) {
    return this.permissionService.getRolePermissions(id);
  }

  @Post('roles/:id/permissions')
  assignPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPermissionsDto) {
    return this.permissionService.assignPermissions(id, dto);
  }

  // ========== 用户角色分配 ==========

  @Get('users/:userId/roles')
  getUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.permissionService.getUserRoles(userId);
  }

  @Post('users/roles')
  assignUserRoles(@Body() dto: AssignRolesDto) {
    return this.permissionService.assignUserRoles(dto);
  }
}

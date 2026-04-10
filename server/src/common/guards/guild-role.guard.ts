import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GuildRole } from '../constants/enums';

@Injectable()
export class GuildRoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[]>('guildRoles', context.getHandler());
    if (!requiredRoles || !requiredRoles.length) return true;

    const request = context.switchToHttp().getRequest();
    const memberRole = request.guildRole;

    if (!memberRole) throw new ForbiddenException('缺少公会角色信息');

    // super_admin 拥有所有权限
    if (memberRole === GuildRole.SUPER_ADMIN) return true;

    // SSVIP 只读访问 — 如果 requiredRoles 包含 ssvip 则放行
    if (memberRole === GuildRole.SSVIP) {
      if (requiredRoles.includes(GuildRole.SSVIP)) return true;
      // SSVIP 默认只读，不允许写操作
      throw new ForbiddenException('SSVIP 仅有查看权限');
    }

    if (!requiredRoles.includes(memberRole)) {
      throw new ForbiddenException('权限不足');
    }
    return true;
  }
}

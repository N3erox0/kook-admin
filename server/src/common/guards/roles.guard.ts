import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const { user } = request;
    if (!user) return false;

    // 优先使用 JWT payload 中的 roles
    if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) {
      return requiredRoles.some((role) => user.roles.includes(role));
    }

    // 如果 JWT 没有 roles，使用 GuildGuard 设置的 guildRole
    const guildRole = request.guildRole;
    if (guildRole) {
      // super_admin 放行所有
      if (guildRole === 'super_admin') return true;
      return requiredRoles.some((role) => role === guildRole);
    }

    // admin 用户放行
    if (user.username === 'admin') {
      return true;
    }

    // 检查用户的全局角色（SSVIP）
    if (user.globalRole && requiredRoles.includes(user.globalRole)) {
      return true;
    }

    return false;
  }
}

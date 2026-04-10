import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuildMember } from '../../modules/member/entities/guild-member.entity';
import { User } from '../../modules/user/entities/user.entity';
import { GuildRole, GlobalRole } from '../constants/enums';

@Injectable()
export class GuildGuard implements CanActivate {
  constructor(
    @InjectRepository(GuildMember)
    private memberRepo: Repository<GuildMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const guildId = parseInt(request.headers['x-guild-id'] || request.params.guildId || '0');

    if (!guildId) throw new ForbiddenException('缺少公会上下文（X-Guild-Id header）');
    if (!user?.userId && !user?.sub) throw new ForbiddenException('未认证');

    const userId = user.userId || user.sub;

    // 先检查是否是公会成员
    const member = await this.memberRepo.findOne({
      where: { guildId, userId, status: 'active' },
    });

    if (member) {
      request.guildId = guildId;
      request.guildMember = member;
      request.guildRole = member.role;
      return true;
    }

    // 非公会成员 — 检查是否为 SSVIP（全局角色，可只读访问所有公会）
    const dbUser = await this.userRepo.findOne({ where: { id: userId } });
    if (dbUser?.globalRole === GlobalRole.SSVIP) {
      request.guildId = guildId;
      request.guildMember = null;
      request.guildRole = GuildRole.SSVIP;
      request.isSSVIP = true;
      return true;
    }

    throw new ForbiddenException('你不是该公会成员');
  }
}

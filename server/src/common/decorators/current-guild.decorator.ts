import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentGuild = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    if (data === 'id') return request.guildId;
    if (data === 'role') return request.guildRole;
    if (data === 'member') return request.guildMember;
    return {
      guildId: request.guildId,
      guildRole: request.guildRole,
      guildMember: request.guildMember,
    };
  },
);

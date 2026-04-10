import { SetMetadata } from '@nestjs/common';

export const GuildRoles = (...roles: string[]) => SetMetadata('guildRoles', roles);

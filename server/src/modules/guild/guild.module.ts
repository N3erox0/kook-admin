import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuildController } from './guild.controller';
import { GuildService } from './guild.service';
import { Guild } from './entities/guild.entity';
import { InviteCode } from './entities/invite-code.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Guild, InviteCode, GuildMember, User])],
  controllers: [GuildController],
  providers: [GuildService],
  exports: [GuildService],
})
export class GuildModule {}

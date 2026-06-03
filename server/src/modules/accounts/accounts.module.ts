import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { User } from '../user/entities/user.entity';
import { GuildMember } from '../member/entities/guild-member.entity';

/**
 * V3.2 登录账号模块（公会维度）
 * 路由：/api/guild/:guildId/accounts
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, GuildMember])],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}

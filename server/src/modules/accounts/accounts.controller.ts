import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto, UpdateAccountDto, ResetAccountPasswordDto, QueryAccountsDto } from './dto/accounts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';

/**
 * V3.2 公会维度的登录账号管理（仅超管可见）
 * 路由：/api/guild/:guildId/accounts
 */
@ApiTags('登录账号')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@GuildRoles(GuildRole.SUPER_ADMIN)
@Controller('api/guild/:guildId/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  @ApiOperation({ summary: '账号列表（公会维度，所有来源）' })
  list(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryAccountsDto) {
    return this.accountsService.list(guildId, query);
  }

  @Post()
  @ApiOperation({ summary: '手动创建登录账号' })
  create(@Param('guildId', ParseIntPipe) guildId: number, @Body() dto: CreateAccountDto) {
    return this.accountsService.createManual(guildId, dto);
  }

  @Put(':memberId')
  @ApiOperation({ summary: '更新账号（角色/状态）' })
  update(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(guildId, memberId, dto);
  }

  @Post(':memberId/reset-password')
  @ApiOperation({ summary: '重置密码（仅手动账号）' })
  resetPassword(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: ResetAccountPasswordDto,
  ) {
    return this.accountsService.resetPassword(guildId, memberId, dto);
  }
}

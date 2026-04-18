import { Controller, Get, Post, Put, Param, Body, ParseIntPipe, UseGuards, Query, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuildService } from './guild.service';
import { CreateGuildDto, UpdateGuildDto, ValidateInviteCodeDto, GenerateInviteCodesDto, UpdateMemberRoleDto, UpdateInviteCodeStatusDto } from './dto/guild.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuildRole } from '../../common/constants/enums';

@ApiTags('公会管理')
@Controller('api/guilds')
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  // ===== 邀请码管理（仅 SSVIP 可操作） =====

  @Post('invite-codes/validate')
  @ApiOperation({ summary: '验证邀请码（公开接口）' })
  validateInviteCode(@Body() dto: ValidateInviteCodeDto) {
    return this.guildService.validateInviteCode(dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite-codes/generate')
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量生成邀请码（仅SSVIP）' })
  generateInviteCodes(@Body() dto: GenerateInviteCodesDto, @CurrentUser() user: any) {
    this.ensureSSVIP(user);
    return this.guildService.generateInviteCodes(dto, user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invite-codes')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取所有邀请码列表（仅SSVIP）' })
  getAllInviteCodes(@CurrentUser() user: any) {
    this.ensureSSVIP(user);
    return this.guildService.getAllInviteCodes();
  }

  @UseGuards(JwtAuthGuard)
  @Get('invite-codes/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取邀请码详情（仅SSVIP）' })
  getInviteCodeById(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    this.ensureSSVIP(user);
    return this.guildService.getInviteCodeById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('invite-codes/:id/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改邀请码状态（仅SSVIP）' })
  updateInviteCodeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInviteCodeStatusDto,
    @CurrentUser() user: any,
  ) {
    this.ensureSSVIP(user);
    return this.guildService.updateInviteCodeStatus(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('invite-codes/:id/disable')
  @ApiBearerAuth()
  @ApiOperation({ summary: '作废邀请码（仅SSVIP，兼容旧接口）' })
  disableInviteCode(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    this.ensureSSVIP(user);
    return this.guildService.updateInviteCodeStatus(id, { status: 'revoked' });
  }

  // ===== 公会激活（模块二） =====

  @Get('activate/info')
  @ApiOperation({ summary: '查询激活码状态（公开接口）' })
  getActivationInfo(@Query('code') code: string) {
    return this.guildService.getActivationInfo(code);
  }

  @Post('activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '激活公会（需登录，原子性激活公会+绑定管理员）' })
  activateGuild(
    @Body() body: { code: string; nickname?: string },
    @CurrentUser() user: any,
  ) {
    return this.guildService.activateGuildForUser(body.code, user.sub || user.userId, body.nickname);
  }

  // ===== 公会管理 =====

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建公会（需要邀请码）' })
  createGuild(@Body() dto: CreateGuildDto, @CurrentUser() user: any) {
    return this.guildService.createGuild(dto, user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取我的公会列表' })
  getMyGuilds(@CurrentUser() user: any) {
    return this.guildService.findGuildsByUserId(user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('all')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'SSVIP: 获取所有公会列表（仅SSVIP）' })
  getAllGuilds(@CurrentUser() user: any) {
    this.ensureSSVIP(user);
    return this.guildService.findAllGuildsForSSVIP();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取公会详情' })
  getGuild(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.findGuildById(id);
  }

  @UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @Put(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: '更新公会信息（仅超管）' })
  updateGuild(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGuildDto) {
    return this.guildService.updateGuild(id, dto);
  }

  @UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @Put(':id/members/role')
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改成员角色（仅超管）' })
  updateMemberRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMemberRoleDto) {
    return this.guildService.updateMemberRole(id, dto);
  }

  @UseGuards(JwtAuthGuard, GuildGuard)
  @Get(':id/members')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取公会成员列表' })
  getGuildMembers(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.getGuildMembers(id);
  }

  /**
   * F-102C: 一键创建子账号（超管限定）
   * 自动生成用户名+密码，绑定到当前公会
   */
  @UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @Post(':id/sub-account')
  @ApiBearerAuth()
  @ApiOperation({ summary: '一键创建子账号（仅超管）' })
  createSubAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { role?: string; nickname?: string },
    @CurrentUser() user: any,
  ) {
    return this.guildService.createSubAccount(id, dto || {}, user.sub || user.userId);
  }

  /** 内部方法：校验当前用户是否为 SSVIP */
  private ensureSSVIP(user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') {
      throw new ForbiddenException('仅 SSVIP 可执行此操作');
    }
  }
}

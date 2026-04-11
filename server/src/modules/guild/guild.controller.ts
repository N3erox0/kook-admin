import { Controller, Get, Post, Put, Param, Body, ParseIntPipe, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { GuildService } from './guild.service';
import { CreateGuildDto, UpdateGuildDto, ValidateInviteCodeDto, GenerateInviteCodesDto, UpdateMemberRoleDto, UpdateInviteCodeStatusDto } from './dto/guild.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('公会管理')
@Controller('api/guilds')
export class GuildController {
  constructor(private readonly guildService: GuildService) {}

  // ===== 邀请码管理 =====

  @Post('invite-codes/validate')
  @ApiOperation({ summary: '验证邀请码（公开接口）' })
  validateInviteCode(@Body() dto: ValidateInviteCodeDto) {
    return this.guildService.validateInviteCode(dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invite-codes/generate')
  @ApiOperation({ summary: '批量生成邀请码' })
  generateInviteCodes(@Body() dto: GenerateInviteCodesDto, @CurrentUser() user: any) {
    return this.guildService.generateInviteCodes(dto, user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invite-codes')
  @ApiOperation({ summary: '获取所有邀请码列表' })
  getAllInviteCodes() {
    return this.guildService.getAllInviteCodes();
  }

  @UseGuards(JwtAuthGuard)
  @Get('invite-codes/:id')
  @ApiOperation({ summary: '获取邀请码详情' })
  getInviteCodeById(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.getInviteCodeById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put('invite-codes/:id/status')
  @ApiOperation({ summary: '修改邀请码状态' })
  updateInviteCodeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInviteCodeStatusDto,
  ) {
    return this.guildService.updateInviteCodeStatus(id, dto);
  }

  // 向下兼容旧的 disable 接口
  @UseGuards(JwtAuthGuard)
  @Put('invite-codes/:id/disable')
  @ApiOperation({ summary: '作废邀请码（兼容旧接口）' })
  disableInviteCode(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.updateInviteCodeStatus(id, { status: 'revoked' });
  }

  // ===== 公会激活（模块二） =====

  @Get('activate/info')
  @ApiOperation({ summary: '查询激活码状态（公开接口）' })
  getActivationInfo(@Query('code') code: string) {
    return this.guildService.getActivationInfo(code);
  }

  @Post('activate')
  @ApiOperation({ summary: '激活公会（原子性创建用户+激活公会+绑定管理员）' })
  activateGuild(@Body() body: { code: string; username: string; password: string; nickname?: string; kookUserId?: string }) {
    return this.guildService.activateGuild(body.code, body);
  }

  // ===== 公会管理 =====

  @UseGuards(JwtAuthGuard)
  @Post()
  @ApiOperation({ summary: '创建公会（需要邀请码）' })
  createGuild(@Body() dto: CreateGuildDto, @CurrentUser() user: any) {
    return this.guildService.createGuild(dto, user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  @ApiOperation({ summary: '获取我的公会列表' })
  getMyGuilds(@CurrentUser() user: any) {
    return this.guildService.findGuildsByUserId(user.sub || user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('all')
  @ApiOperation({ summary: 'SSVIP: 获取所有公会列表' })
  getAllGuilds() {
    return this.guildService.findAllGuildsForSSVIP();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  @ApiOperation({ summary: '获取公会详情' })
  getGuild(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.findGuildById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  @ApiOperation({ summary: '更新公会信息' })
  updateGuild(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGuildDto) {
    return this.guildService.updateGuild(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/members/role')
  @ApiOperation({ summary: '修改成员角色' })
  updateMemberRole(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMemberRoleDto) {
    return this.guildService.updateMemberRole(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/members')
  @ApiOperation({ summary: '获取公会成员列表' })
  getGuildMembers(@Param('id', ParseIntPipe) id: number) {
    return this.guildService.getGuildMembers(id);
  }
}

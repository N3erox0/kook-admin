import { Controller, Get, Query, Param, ParseIntPipe, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LogService } from './log.service';
import { QueryLogDto } from './dto/log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@ApiTags('操作日志')
@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@GuildRoles(GuildRole.SUPER_ADMIN)
@ApiBearerAuth()
@Controller('api/guild/:guildId/logs')
export class LogController {
  constructor(
    private readonly logService: LogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '操作日志列表（公会隔离）' })
  findAll(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryLogDto) {
    return this.logService.findAll(query, guildId);
  }

  @Get('modules')
  @ApiOperation({ summary: '获取模块列表' })
  getModules(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.logService.getModules(guildId);
  }

  @Get('scheduled-tasks')
  @ApiOperation({ summary: '定时任务执行记录' })
  async getScheduledTasks() {
    return this.logService.getScheduledTasks();
  }
}

/** SSVIP 专属日志控制器（不需要公会上下文） */
@ApiTags('SSVIP操作日志')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('api/admin/logs')
export class LogAdminController {
  constructor(private readonly logService: LogService) {}

  @Get()
  @ApiOperation({ summary: 'SSVIP操作日志（guild_id IS NULL）' })
  findAll(@Query() query: QueryLogDto, @CurrentUser() user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') {
      return { list: [], total: 0 };
    }
    return this.logService.findAll(query, null);
  }

  @Get('scheduled-tasks')
  @ApiOperation({ summary: '定时任务执行记录' })
  async getScheduledTasks(@CurrentUser() user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') return [];
    return this.logService.getScheduledTasks();
  }

  @Get('modules')
  @ApiOperation({ summary: '获取模块列表（SSVIP）' })
  getModules(@CurrentUser() user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') return [];
    return this.logService.getModules();
  }
}

/** 兼容旧路由 /api/logs：必须带 X-Guild-Id 且为该公会 super_admin 或全局 SSVIP */
@ApiTags('操作日志（兼容）')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('api/logs')
export class LogLegacyController {
  constructor(
    private readonly logService: LogService,
    @InjectRepository(GuildMember) private readonly memberRepo: Repository<GuildMember>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  private async resolveGuildId(req: any, user: any): Promise<number> {
    const userId = user?.userId || user?.sub;
    const guildId = parseInt(req.headers['x-guild-id'] || '0', 10);
    if (!guildId) throw new ForbiddenException('缺少公会上下文（X-Guild-Id header）');

    const dbUser = await this.userRepo.findOne({ where: { id: userId } });
    if (dbUser?.globalRole === 'ssvip') return guildId;

    const member = await this.memberRepo.findOne({ where: { guildId, userId } });
    if (!member) throw new ForbiddenException('你不是该公会成员');
    if (member.role !== GuildRole.SUPER_ADMIN) {
      throw new ForbiddenException('仅公会超级管理员可查看操作日志');
    }
    return guildId;
  }

  @Get()
  @ApiOperation({ summary: '操作日志列表（兼容旧路由，强制公会隔离）' })
  async findAll(@Query() query: QueryLogDto, @Req() req: any, @CurrentUser() user: any) {
    const guildId = await this.resolveGuildId(req, user);
    return this.logService.findAll(query, guildId);
  }

  @Get('modules')
  @ApiOperation({ summary: '获取模块列表（强制公会隔离）' })
  async getModules(@Req() req: any, @CurrentUser() user: any) {
    const guildId = await this.resolveGuildId(req, user);
    return this.logService.getModules(guildId);
  }
}

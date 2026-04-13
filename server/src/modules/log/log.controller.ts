import { Controller, Get, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LogService } from './log.service';
import { QueryLogDto } from './dto/log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

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
}

/** 兼容旧路由 /api/logs（重定向到公会隔离版本） */
@ApiTags('操作日志（兼容）')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('api/logs')
export class LogLegacyController {
  constructor(private readonly logService: LogService) {}

  @Get()
  @ApiOperation({ summary: '操作日志列表（兼容旧路由，需X-Guild-Id header）' })
  findAll(@Query() query: QueryLogDto) {
    return this.logService.findAll(query);
  }

  @Get('modules')
  @ApiOperation({ summary: '获取模块列表' })
  getModules() {
    return this.logService.getModules();
  }
}

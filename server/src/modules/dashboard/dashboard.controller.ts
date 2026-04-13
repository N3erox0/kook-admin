import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KookSyncService } from '../kook/kook-sync.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';

@Controller('api')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly kookSyncService: KookSyncService,
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
  ) {}

  /** 模块一：系统超管控制台（仅SSVIP） */
  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard)
  getAdminOverview(@CurrentUser() user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') {
      throw new ForbiddenException('仅 SSVIP 可访问系统超管控制台');
    }
    return this.dashboardService.getAdminOverview();
  }

  /** 模块二：公会管理员控制台 */
  @Get('guild/:guildId/dashboard/overview')
  @UseGuards(JwtAuthGuard, GuildGuard)
  getOverview(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.dashboardService.getOverview(guildId);
  }

  /** 手动触发成员同步 */
  @Post('guild/:guildId/dashboard/sync-members')
  @UseGuards(JwtAuthGuard, GuildGuard)
  async syncMembers(@Param('guildId', ParseIntPipe) guildId: number) {
    const guild = await this.guildRepo.findOne({ where: { id: guildId } });
    if (!guild) {
      return { success: false, message: '公会不存在' };
    }
    if (!guild.kookBotToken || !guild.kookGuildId) {
      return { success: false, message: '公会未配置 KOOK Bot Token 或服务器 ID，请在公会设置中配置' };
    }
    try {
      const result = await this.kookSyncService.syncGuildMembers(guild);
      return { success: true, ...result };
    } catch (err: any) {
      return { success: false, message: `同步失败：${err.message || '未知错误'}` };
    }
  }
}

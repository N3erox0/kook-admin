import { Controller, Get, Post, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
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

  /** 模块一：系统超管控制台（SSVIP） */
  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard)
  getAdminOverview() {
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
    if (!guild || !guild.kookBotToken || !guild.kookGuildId) {
      return { success: false, message: '公会未配置 KOOK Bot Token 或服务器 ID' };
    }
    const result = await this.kookSyncService.syncGuildMembers(guild);
    return { success: true, ...result };
  }
}

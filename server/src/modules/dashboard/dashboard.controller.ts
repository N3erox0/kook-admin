import { Controller, Get, Post, Param, ParseIntPipe, UseGuards, ForbiddenException, Logger } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KookSyncService } from '../kook/kook-sync.service';
import { MemberService } from '../member/member.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';

@Controller('api')
export class DashboardController {
  private readonly logger = new Logger(DashboardController.name);

  constructor(
    private readonly dashboardService: DashboardService,
    private readonly kookSyncService: KookSyncService,
    private readonly memberService: MemberService,
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

  /** 手动触发成员同步（KOOK + Albion） */
  @Post('guild/:guildId/dashboard/sync-members')
  @UseGuards(JwtAuthGuard, GuildGuard)
  async syncMembers(@Param('guildId', ParseIntPipe) guildId: number) {
    // V3.3.0: 外层 try/catch 兜底，任何意外异常都包装为 200 业务错误返回，
    // 避免抛出 500 让前端只看到"立即同步成员"按钮卡死。
    try {
      const guild = await this.guildRepo.findOne({ where: { id: guildId } });
      if (!guild) {
        return { success: false, message: '公会不存在' };
      }

      let kookResult: any = null;
      let albionResult: any = null;

      // 同步 KOOK 成员
      if (guild.kookGuildId && !guild.kookGuildId.startsWith('test-')) {
        try {
          kookResult = await this.kookSyncService.syncGuildMembers(guild);
        } catch (err: any) {
          this.logger.error(
            `[sync-members] KOOK同步异常 guildId=${guildId}: ${err.message}\n${err.stack || ''}`,
          );
          kookResult = { error: err.message || 'KOOK同步失败' };
        }
      }

      // 同步 Albion 成员
      if (guild.albionGuildId) {
        try {
          albionResult = await this.memberService.syncAlbionGuildMembers(guildId);
        } catch (err: any) {
          this.logger.error(
            `[sync-members] Albion同步异常 guildId=${guildId}: ${err.message}\n${err.stack || ''}`,
          );
          albionResult = { error: err.message || 'Albion同步失败' };
        }
      }

      return {
        success: true,
        added: albionResult?.added || 0,
        updated: albionResult?.updated || 0,
        left: albionResult?.left || 0,
        autoBound: albionResult?.autoBound || 0,
        kook: kookResult,
        albion: albionResult,
      };
    } catch (err: any) {
      // V3.3.0: 兜底 catch — 让前端总能拿到结构化业务错误而不是 500
      this.logger.error(
        `[sync-members] 未捕获异常 guildId=${guildId}: ${err.message}\n${err.stack || ''}`,
      );
      return {
        success: false,
        message: err.message || '同步成员发生未知错误',
      };
    }
  }
}

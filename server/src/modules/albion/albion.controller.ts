import { Controller, Get, Post, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AlbionKillboardService } from './albion-killboard.service';
import { AlbionService } from './albion.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';

@ApiTags('战报')
@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/battle-reports')
export class AlbionController {
  constructor(
    private readonly killboardService: AlbionKillboardService,
    private readonly albionService: AlbionService,
  ) {}

  /** 搜索 Albion 公会（快速绑定用） */
  @Get('search-guild')
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @ApiOperation({ summary: '搜索 Albion 公会' })
  async searchGuild(
    @Query('name') name: string,
    @Query('server') server?: string,
  ) {
    if (!name || name.trim().length < 2) {
      return { guilds: [], error: '公会名至少2个字符' };
    }
    try {
      const baseUrl = this.albionService.getBaseUrl(server as any);
      const url = `${baseUrl}/search?q=${encodeURIComponent(name.trim())}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'kook-admin/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return { guilds: [], error: `API请求失败: HTTP ${res.status}` };
      const data = await res.json() as any;
      const guilds = (data?.guilds || []).map((g: any) => ({
        id: g.Id,
        name: g.Name,
        allianceName: g.AllianceName || null,
        memberCount: g.MemberCount || 0,
      }));
      return { guilds };
    } catch (err: any) {
      return { guilds: [], error: err.message || '搜索失败' };
    }
  }

  @Get()
  @ApiOperation({ summary: '获取战报列表' })
  getReports(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('memberName') memberName?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.killboardService.getReports(guildId, {
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 50,
      memberName,
      startDate,
      endDate,
    });
  }

  @Post('pull')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @ApiOperation({ summary: '手动拉取公会战报' })
  pullDeaths(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.killboardService.pullGuildDeaths(guildId);
  }
}

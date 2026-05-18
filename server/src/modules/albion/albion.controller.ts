import { Controller, Get, Post, Query, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AlbionKillboardService } from './albion-killboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';

@ApiTags('战报')
@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/battle-reports')
export class AlbionController {
  constructor(private readonly killboardService: AlbionKillboardService) {}

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

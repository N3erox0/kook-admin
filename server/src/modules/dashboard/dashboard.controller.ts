import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';

@UseGuards(JwtAuthGuard, GuildGuard)
@Controller('api/guild/:guildId/dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.dashboardService.getOverview(guildId);
  }
}

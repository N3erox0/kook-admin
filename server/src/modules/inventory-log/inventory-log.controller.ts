import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { InventoryLogService } from './inventory-log.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';

@UseGuards(JwtAuthGuard, GuildGuard)
@Controller('api/guild/:guildId/inventory')
export class InventoryLogController {
  constructor(private readonly logService: InventoryLogService) {}

  @Get(':inventoryId/logs')
  getInventoryLogs(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('inventoryId', ParseIntPipe) inventoryId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.logService.findByInventoryId(guildId, inventoryId, page || 1, pageSize || 20);
  }

  @Get('logs')
  getAllLogs(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.logService.findByGuild(guildId, page || 1, pageSize || 50);
  }
}

import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AlertService } from './alert.service';
import { CreateAlertRuleDto, UpdateAlertRuleDto, QueryAlertRecordDto } from './dto/alert.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { GuildRole } from '../../common/constants/enums';

@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/alerts')
export class AlertController {
  constructor(private readonly alertService: AlertService) {}

  @Get('rules')
  findRules(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.alertService.findAllRules(guildId);
  }

  @Post('rules')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  createRule(@Param('guildId', ParseIntPipe) guildId: number, @Body() dto: CreateAlertRuleDto, @CurrentUser() user: any) {
    return this.alertService.createRule(guildId, dto, user.sub);
  }

  @Put('rules/:id')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  updateRule(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAlertRuleDto) {
    return this.alertService.updateRule(guildId, id, dto);
  }

  @Delete('rules/:id')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  removeRule(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number) {
    return this.alertService.removeRule(guildId, id);
  }

  @Get('records')
  findRecords(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryAlertRecordDto) {
    return this.alertService.findAllRecords(guildId, query);
  }

  @Put('records/:id/resolve')
  resolveRecord(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number) {
    return this.alertService.resolveRecord(guildId, id);
  }
}

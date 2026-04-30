import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { QueryInventoryDto, UpsertInventoryDto, BatchUpsertInventoryDto, AdjustQuantityDto, UpdateInventoryFieldDto } from './dto/equipment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { GuildRole } from '../../common/constants/enums';

@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/inventory')
export class EquipmentController {
  constructor(private readonly equipmentService: EquipmentService) {}

  @Get()
  findAll(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryInventoryDto) {
    return this.equipmentService.findAll(guildId, query);
  }

  @Get('overview')
  getOverview(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.equipmentService.getOverview(guildId);
  }

  @Post()
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'equipment', action: 'upsert' })
  upsert(@Param('guildId', ParseIntPipe) guildId: number, @Body() dto: UpsertInventoryDto, @CurrentUser() user: any, @Request() req: any) {
    return this.equipmentService.upsert(guildId, dto, user.sub, req.guildMember?.nickname || user.username);
  }

  @Post('batch')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'equipment', action: 'batch_upsert' })
  batchUpsert(@Param('guildId', ParseIntPipe) guildId: number, @Body() dto: BatchUpsertInventoryDto, @CurrentUser() user: any, @Request() req: any) {
    return this.equipmentService.batchUpsert(guildId, dto.items, user.sub, req.guildMember?.nickname || user.username);
  }

  // V2.9.2 网格识别入库（方案D）
  @Post('grid-parse')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'equipment', action: 'grid_parse' })
  gridParse(@Param('guildId', ParseIntPipe) _guildId: number, @Body() body: { imageUrl: string; layout?: string; anchor?: { x: number; y: number; w: number; h: number }; boxes?: Array<{ x: number; y: number; w: number; h: number }> }) {
    return this.equipmentService.gridParse(body.imageUrl, body.layout, body.anchor, body.boxes);
  }

  @Post('grid-save')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'equipment', action: 'grid_save' })
  gridSave(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() body: { items: Array<{ aliasName: string; level: number; quality: number; quantity: number; location?: string }> },
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.equipmentService.gridSave(guildId, body.items, user.sub, req.guildMember?.nickname || user.username);
  }

  @Patch(':id')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  updateFields(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInventoryFieldDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.equipmentService.updateFields(guildId, id, dto, user.sub, req.guildMember?.nickname || user.username);
  }

  @Put(':id/adjust')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  adjust(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustQuantityDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.equipmentService.adjustQuantity(guildId, id, dto.delta, user.sub, req.guildMember?.nickname || user.username);
  }

  @Delete(':id')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'equipment', action: 'delete' })
  remove(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Request() req: any) {
    return this.equipmentService.remove(guildId, id, user.sub, req.guildMember?.nickname || user.username);
  }
}

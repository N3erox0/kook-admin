import { Controller, Post, Get, Put, Body, Param, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OcrService } from './ocr.service';
import { ImageMatchService } from './image-match.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { GuildRole } from '../../common/constants/enums';

@ApiTags('OCR 识别')
@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/ocr')
export class OcrController {
  constructor(
    private readonly ocrService: OcrService,
    private readonly imageMatchService: ImageMatchService,
  ) {}

  @Post('batch')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'ocr', action: 'create_batch' })
  @ApiOperation({ summary: '创建 OCR 识别批次' })
  createBatch(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() body: { imageUrl: string; imageType?: string },
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.ocrService.createBatch(
      guildId, body.imageUrl, body.imageType || 'equipment',
      user.sub || user.userId, req.guildMember?.nickname || user.username,
    );
  }

  @Post('generate-phash')
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @ApiOperation({ summary: '批量生成装备图片指纹(pHash)' })
  generatePhash() {
    return this.imageMatchService.batchGeneratePhash();
  }

  @Get('batches')
  @ApiOperation({ summary: '获取 OCR 批次列表' })
  getBatches(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.ocrService.getBatches(guildId, page || 1, pageSize || 20);
  }

  @Get('batch/:batchId')
  @ApiOperation({ summary: '获取批次详情（含识别结果）' })
  getBatchDetail(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.ocrService.getBatchDetail(batchId);
  }

  @Put('item/:itemId/confirm')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @ApiOperation({ summary: '人工确认单条识别结果' })
  confirmItem(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: { confirmedName?: string; confirmedCatalogId?: number; confirmedLevel?: number; confirmedQuality?: number; confirmedQuantity?: number; status: 'confirmed' | 'discarded' },
  ) {
    return this.ocrService.confirmItem(itemId, body);
  }

  @Post('batch/:batchId/confirm-all')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @ApiOperation({ summary: '批量确认所有待确认项' })
  confirmAll(@Param('batchId', ParseIntPipe) batchId: number) {
    return this.ocrService.confirmAllItems(batchId);
  }

  @Post('batch/:batchId/save')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'ocr', action: 'save_to_inventory' })
  @ApiOperation({ summary: '将已确认的装备写入库存' })
  saveToInventory(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('batchId', ParseIntPipe) batchId: number,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.ocrService.saveToInventory(batchId, guildId, user.sub || user.userId, req.guildMember?.nickname || user.username);
  }

  @Get('kook-pending')
  @ApiOperation({ summary: '获取KOOK待识别工作区列表' })
  getKookPending(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.ocrService.getKookPendingBatches(guildId, page || 1, pageSize || 20);
  }
}

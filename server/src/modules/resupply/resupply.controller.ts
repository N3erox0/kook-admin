import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ResupplyService } from './resupply.service';
import { CreateResupplyDto, ProcessResupplyDto, UpdateResupplyFieldsDto, BatchProcessDto, BatchAssignRoomDto, QueryResupplyDto, QuickCompleteResupplyDto, BatchRejectDto } from './dto/resupply.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OperationLog } from '../../common/decorators/operation-log.decorator';
import { GuildRole } from '../../common/constants/enums';

@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/resupply')
export class ResupplyController {
  constructor(private readonly resupplyService: ResupplyService) {}

  @Get()
  findAll(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryResupplyDto) {
    return this.resupplyService.findAll(guildId, query);
  }

  @Get('merged')
  getMerged(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryResupplyDto) {
    return this.resupplyService.getMergedList(guildId, query);
  }

  @Get('grouped')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  getGrouped(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.resupplyService.getGroupedByEquipment(guildId, keyword);
  }

  @Get(':id')
  findOne(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number) {
    return this.resupplyService.findOne(guildId, id);
  }

  @Post()
  @OperationLog({ module: 'resupply', action: 'create' })
  create(@Param('guildId', ParseIntPipe) guildId: number, @Body() dto: CreateResupplyDto) {
    return this.resupplyService.create(guildId, dto);
  }

  @Put(':id/fields')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'update' })
  updateFields(@Param('guildId', ParseIntPipe) guildId: number, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateResupplyFieldsDto) {
    return this.resupplyService.updateFields(guildId, id, dto);
  }

  @Put(':id/process')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'process' })
  process(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ProcessResupplyDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.resupplyService.process(guildId, id, dto, user.sub, req.guildMember?.nickname || user.username);
  }

  @Post('batch-process')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'batch_process' })
  batchProcess(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() dto: BatchProcessDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.resupplyService.batchProcess(guildId, dto, user.sub, req.guildMember?.nickname || user.username);
  }

  @Post('batch-assign-room')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'assign_room' })
  batchAssignRoom(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() dto: BatchAssignRoomDto,
  ) {
    return this.resupplyService.batchAssignRoom(guildId, dto);
  }

  /**
   * F-108: 快捷补装完成（待识别路径B — 单条修正后直接扣库存+完成）
   */
  @Post(':id/quick-complete')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'quick_complete' })
  quickComplete(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: QuickCompleteResupplyDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.resupplyService.quickComplete(
      guildId, id, dto,
      user.sub, req.guildMember?.nickname || user.username,
    );
  }

  /**
   * F-108: 批量废弃（待识别路径A — 多选标记为 rejected）
   */
  @Post('batch-reject')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  @OperationLog({ module: 'resupply', action: 'batch_reject' })
  batchReject(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() dto: BatchRejectDto,
    @CurrentUser() user: any,
    @Request() req: any,
  ) {
    return this.resupplyService.batchReject(
      guildId, dto,
      user.sub, req.guildMember?.nickname || user.username,
    );
  }

  /**
   * V2.9.3: 补装申请图像识别预览（原图 + 方框 + Top5 候选）
   * 根据 resupplyId 取 screenshotUrl 进行 pHash 匹配
   */
  @Post(':id/preview-match')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  previewMatch(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { topN?: number; autoThreshold?: number },
  ) {
    return this.resupplyService.previewMatchForResupply(guildId, id, body || {});
  }

  /**
   * V2.9.3: 按 URL 直接预览（供待识别 Tab 的 OCR 批次截图使用）
   */
  @Post('preview-from-url')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.RESUPPLY_STAFF)
  previewFromUrl(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() body: { imageUrl: string; topN?: number; autoThreshold?: number },
  ) {
    return this.resupplyService.previewMatchFromUrl(body.imageUrl, {
      topN: body.topN,
      autoThreshold: body.autoThreshold,
    });
  }
}

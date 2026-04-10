import { Controller, Get, Post, Put, Body, Param, Query, ParseIntPipe, UseGuards, Request } from '@nestjs/common';
import { ResupplyService } from './resupply.service';
import { CreateResupplyDto, ProcessResupplyDto, UpdateResupplyFieldsDto, BatchProcessDto, QueryResupplyDto } from './dto/resupply.dto';
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
}

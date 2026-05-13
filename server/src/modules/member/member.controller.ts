import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { MemberService } from './member.service';
import { QueryMemberDto, UpdateMemberRoleDto } from './dto/member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';
import { OperationLog } from '../../common/decorators/operation-log.decorator';

@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  findAll(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query() query: QueryMemberDto,
  ) {
    return this.memberService.findAll(guildId, query);
  }

  @Get('daily-stats')
  getDailyStats(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.memberService.getDailyStatistics(guildId);
  }

  @Get('albion')
  findAlbionMembers(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query() query: QueryMemberDto,
  ) {
    return this.memberService.findAlbionMembers(guildId, query);
  }

  @Post('albion/sync')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'member', action: 'sync_albion_members' })
  syncAlbionMembers(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.memberService.syncAlbionGuildMembers(guildId);
  }

  @Get('kook/search')
  searchKookMembers(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.memberService.searchKookMembers(guildId, keyword || '');
  }

  @Post('albion/:playerId/bind')
  @GuildRoles(GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN)
  @OperationLog({ module: 'member', action: 'bind_albion_member' })
  bindAlbionMember(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('playerId') playerId: string,
    @Body() body: { guildMemberId: number },
  ) {
    return this.memberService.bindAlbionMember(
      guildId,
      playerId,
      body.guildMemberId,
    );
  }

  @Put(':id/role')
  @GuildRoles(GuildRole.SUPER_ADMIN)
  @OperationLog({ module: 'member', action: 'update_role' })
  updateRole(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(guildId, id, dto.role);
  }
}

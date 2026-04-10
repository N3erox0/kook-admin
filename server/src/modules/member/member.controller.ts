import { Controller, Get, Put, Query, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { MemberService } from './member.service';
import { QueryMemberDto, UpdateMemberRoleDto } from './dto/member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GuildGuard } from '../../common/guards/guild.guard';
import { GuildRoleGuard } from '../../common/guards/guild-role.guard';
import { GuildRoles } from '../../common/decorators/guild-roles.decorator';
import { GuildRole } from '../../common/constants/enums';

@UseGuards(JwtAuthGuard, GuildGuard, GuildRoleGuard)
@Controller('api/guild/:guildId/members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  findAll(@Param('guildId', ParseIntPipe) guildId: number, @Query() query: QueryMemberDto) {
    return this.memberService.findAll(guildId, query);
  }

  @Get('daily-stats')
  getDailyStats(@Param('guildId', ParseIntPipe) guildId: number) {
    return this.memberService.getDailyStatistics(guildId);
  }

  @Put(':id/role')
  @GuildRoles(GuildRole.SUPER_ADMIN)
  updateRole(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(guildId, id, dto.role);
  }
}

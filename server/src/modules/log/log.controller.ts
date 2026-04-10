import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LogService } from './log.service';
import { QueryLogDto } from './dto/log.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('操作日志')
@Controller('api/logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get()
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '操作日志列表' })
  findAll(@Query() query: QueryLogDto) {
    return this.logService.findAll(query);
  }

  @Get('modules')
  @Roles('super_admin', 'admin')
  @ApiOperation({ summary: '获取模块列表' })
  getModules() {
    return this.logService.getModules();
  }
}

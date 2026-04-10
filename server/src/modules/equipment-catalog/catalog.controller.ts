import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { CreateCatalogDto, UpdateCatalogDto, QueryCatalogDto, BatchCreateCatalogDto, BatchMatchCatalogDto } from './dto/catalog.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OperationLog } from '../../common/decorators/operation-log.decorator';

@ApiTags('装备参考库')
@UseGuards(JwtAuthGuard)
@Controller('api/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @ApiOperation({ summary: '查询装备参考库列表' })
  findAll(@Query() query: QueryCatalogDto) {
    return this.catalogService.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: '模糊搜索装备（下拉用）' })
  search(@Query('keyword') keyword: string) {
    return this.catalogService.search(keyword || '', 20);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取装备详情（含图片）' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findById(id);
  }

  @Post()
  @OperationLog({ module: 'catalog', action: 'create' })
  @ApiOperation({ summary: '新增装备' })
  create(@Body() dto: CreateCatalogDto) {
    return this.catalogService.create(dto);
  }

  @Post('batch')
  @OperationLog({ module: 'catalog', action: 'batch_create' })
  @ApiOperation({ summary: '批量新增装备' })
  batchCreate(@Body() dto: BatchCreateCatalogDto) {
    return this.catalogService.batchCreate(dto.items);
  }

  @Post('csv-import')
  @OperationLog({ module: 'catalog', action: 'csv_import' })
  @ApiOperation({ summary: 'CSV批量导入装备' })
  csvImport(@Body() body: { items: CreateCatalogDto[] }) {
    return this.catalogService.csvImport(body.items);
  }

  @Post('match')
  @ApiOperation({ summary: '批量精确匹配装备' })
  batchMatch(@Body() dto: BatchMatchCatalogDto) {
    return this.catalogService.batchMatch(dto.items);
  }

  @Put(':id')
  @OperationLog({ module: 'catalog', action: 'update' })
  @ApiOperation({ summary: '更新装备' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCatalogDto) {
    return this.catalogService.update(id, dto);
  }

  @Delete(':id')
  @OperationLog({ module: 'catalog', action: 'delete' })
  @ApiOperation({ summary: '删除装备' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.remove(id);
  }

  // ===== 装备图片管理 =====

  @Get(':id/images')
  @ApiOperation({ summary: '获取装备图片列表' })
  getImages(@Param('id', ParseIntPipe) id: number) {
    return this.catalogService.getImages(id);
  }

  @Post(':id/images')
  @ApiOperation({ summary: '添加装备图片' })
  addImage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { imageUrl: string; imageType?: string; fileName?: string; fileSize?: number; isPrimary?: boolean },
  ) {
    return this.catalogService.addImage(id, body);
  }

  @Delete('images/:imageId')
  @ApiOperation({ summary: '删除装备图片' })
  removeImage(@Param('imageId', ParseIntPipe) imageId: number) {
    return this.catalogService.removeImage(imageId);
  }

  @Put(':id/images/:imageId/primary')
  @ApiOperation({ summary: '设为主图' })
  setPrimaryImage(
    @Param('id', ParseIntPipe) catalogId: number,
    @Param('imageId', ParseIntPipe) imageId: number,
  ) {
    return this.catalogService.setPrimaryImage(catalogId, imageId);
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { EquipmentCatalog } from './entities/equipment-catalog.entity';
import { EquipmentImage } from './entities/equipment-image.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EquipmentCatalog, EquipmentImage])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class EquipmentCatalogModule {}

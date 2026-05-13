import { Module, forwardRef } from '@nestjs/common';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { AlbionService } from './albion.service';

@Module({
  imports: [forwardRef(() => EquipmentCatalogModule)],
  providers: [AlbionService],
  exports: [AlbionService],
})
export class AlbionModule {}

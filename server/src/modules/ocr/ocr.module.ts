import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { ImageMatchService } from './image-match.service';
import { OcrRecognitionBatch } from './entities/ocr-recognition-batch.entity';
import { OcrRecognitionItem } from './entities/ocr-recognition-item.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrRecognitionBatch, OcrRecognitionItem, EquipmentCatalog, GuildMember, User]),
    EquipmentCatalogModule,
    EquipmentModule,
  ],
  controllers: [OcrController],
  providers: [OcrService, ImageMatchService],
  exports: [OcrService, ImageMatchService],
})
export class OcrModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrRecognitionBatch } from './entities/ocr-recognition-batch.entity';
import { OcrRecognitionItem } from './entities/ocr-recognition-item.entity';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { EquipmentModule } from '../equipment/equipment.module';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrRecognitionBatch, OcrRecognitionItem, GuildMember, User]),
    EquipmentCatalogModule,
    EquipmentModule,
  ],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KookService } from './kook.service';
import { KookSyncService } from './kook-sync.service';
import { KookNotifyService } from './kook-notify.service';
import { KookMessageService } from './kook-message.service';
import { KookBotInteractionService } from './kook-bot-interaction.service';
import { KookController } from './kook.controller';
import { GuildMember } from '../member/entities/guild-member.entity';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { BotJoinRecord } from './entities/bot-join-record.entity';
import { OcrModule } from '../ocr/ocr.module';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { ResupplyModule } from '../resupply/resupply.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuildMember, Guild, InviteCode, BotJoinRecord]),
    OcrModule,
    EquipmentCatalogModule,
    forwardRef(() => ResupplyModule),
  ],
  controllers: [KookController],
  providers: [KookService, KookSyncService, KookNotifyService, KookMessageService, KookBotInteractionService],
  exports: [KookService, KookSyncService, KookNotifyService, KookMessageService, KookBotInteractionService],
})
export class KookModule {}

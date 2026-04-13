import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KookService } from './kook.service';
import { KookSyncService } from './kook-sync.service';
import { KookNotifyService } from './kook-notify.service';
import { KookMessageService } from './kook-message.service';
import { KookController } from './kook.controller';
import { GuildMember } from '../member/entities/guild-member.entity';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { OcrModule } from '../ocr/ocr.module';
import { ResupplyModule } from '../resupply/resupply.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuildMember, Guild, InviteCode]),
    OcrModule,
    forwardRef(() => ResupplyModule),
  ],
  controllers: [KookController],
  providers: [KookService, KookSyncService, KookNotifyService, KookMessageService],
  exports: [KookService, KookSyncService, KookNotifyService, KookMessageService],
})
export class KookModule {}

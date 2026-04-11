import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { GuildMember } from '../member/entities/guild-member.entity';
import { GuildInventory } from '../equipment/entities/guild-inventory.entity';
import { GuildResupply } from '../resupply/entities/guild-resupply.entity';
import { GuildAlertRecord } from '../alert/entities/guild-alert-record.entity';
import { User } from '../user/entities/user.entity';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { KookModule } from '../kook/kook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuildMember, GuildInventory, GuildResupply, GuildAlertRecord, User, Guild, InviteCode]),
    KookModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

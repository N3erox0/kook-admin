import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertController } from './alert.controller';
import { AlertService } from './alert.service';
import { GuildAlertRule } from './entities/guild-alert-rule.entity';
import { GuildAlertRecord } from './entities/guild-alert-record.entity';
import { GuildInventory } from '../equipment/entities/guild-inventory.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { GuildResupply } from '../resupply/entities/guild-resupply.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    GuildAlertRule, GuildAlertRecord, GuildInventory, EquipmentCatalog,
    GuildResupply, GuildMember, User,
  ])],
  controllers: [AlertController],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}

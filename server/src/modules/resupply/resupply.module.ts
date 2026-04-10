import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResupplyController } from './resupply.controller';
import { ResupplyService } from './resupply.service';
import { GuildResupply } from './entities/guild-resupply.entity';
import { GuildResupplyLog } from './entities/guild-resupply-log.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';
import { EquipmentModule } from '../equipment/equipment.module';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { KookModule } from '../kook/kook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuildResupply, GuildResupplyLog, GuildMember, User]),
    EquipmentModule,
    EquipmentCatalogModule,
    forwardRef(() => KookModule),
  ],
  controllers: [ResupplyController],
  providers: [ResupplyService],
  exports: [ResupplyService],
})
export class ResupplyModule {}

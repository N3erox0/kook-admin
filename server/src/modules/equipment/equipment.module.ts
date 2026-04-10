import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { GuildInventory } from './entities/guild-inventory.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';
import { InventoryLogModule } from '../inventory-log/inventory-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GuildInventory, EquipmentCatalog, GuildMember, User]),
    InventoryLogModule,
  ],
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentModule {}

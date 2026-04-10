import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryLog } from './entities/inventory-log.entity';
import { InventoryLogService } from './inventory-log.service';
import { InventoryLogController } from './inventory-log.controller';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryLog, GuildMember, User])],
  controllers: [InventoryLogController],
  providers: [InventoryLogService],
  exports: [InventoryLogService],
})
export class InventoryLogModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { ScheduledTask } from './entities/scheduled-task.entity';
import { Guild } from '../guild/entities/guild.entity';
import { InventoryLog } from '../inventory-log/entities/inventory-log.entity';
import { EquipmentCatalog } from '../equipment-catalog/entities/equipment-catalog.entity';
import { KookModule } from '../kook/kook.module';
import { AlertModule } from '../alert/alert.module';
import { ResupplyModule } from '../resupply/resupply.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledTask, Guild, InventoryLog, EquipmentCatalog]),
    KookModule,
    AlertModule,
    ResupplyModule,
  ],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}

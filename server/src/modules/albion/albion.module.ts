import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EquipmentCatalogModule } from '../equipment-catalog/catalog.module';
import { AlbionService } from './albion.service';
import { AlbionKillboardService } from './albion-killboard.service';
import { AlbionController } from './albion.controller';
import { BattleReport } from './entities/battle-report.entity';
import { Guild } from '../guild/entities/guild.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BattleReport, Guild, GuildMember, User]),
    forwardRef(() => EquipmentCatalogModule),
  ],
  controllers: [AlbionController],
  providers: [AlbionService, AlbionKillboardService],
  exports: [AlbionService, AlbionKillboardService],
})
export class AlbionModule {}

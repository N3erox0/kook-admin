import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogController, LogLegacyController } from './log.controller';
import { LogService } from './log.service';
import { OperationLog } from './entities/operation-log.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLog, GuildMember, User])],
  controllers: [LogController, LogLegacyController],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}

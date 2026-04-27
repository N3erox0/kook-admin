import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogController, LogAdminController, LogLegacyController } from './log.controller';
import { LogService } from './log.service';
import { OperationLog } from './entities/operation-log.entity';
import { ScheduledTask } from '../scheduler/entities/scheduled-task.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLog, ScheduledTask, GuildMember, User])],
  controllers: [LogController, LogAdminController, LogLegacyController],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}

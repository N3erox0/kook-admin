import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';
import { GuildMember } from './entities/guild-member.entity';
import { AlbionGuildMember } from './entities/albion-guild-member.entity';
import { MemberAlbionBinding } from './entities/member-albion-binding.entity';
import { Guild } from '../guild/entities/guild.entity';
import { User } from '../user/entities/user.entity';
import { AlbionModule } from '../albion/albion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GuildMember,
      AlbionGuildMember,
      MemberAlbionBinding,
      Guild,
      User,
    ]),
    AlbionModule,
  ],

  controllers: [MemberController],
  providers: [MemberService],
  exports: [MemberService],
})
export class MemberModule {}

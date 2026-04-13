import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from '../guild/entities/guild.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { MemberStatus } from '../../common/constants/enums';
import { KookService } from './kook.service';

@Injectable()
export class KookSyncService {
  private readonly logger = new Logger(KookSyncService.name);

  constructor(
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    private kookService: KookService,
  ) {}

  /** 同步服务器基本信息（名称、图标）到 Guild 表 */
  async syncGuildInfo(guild: Guild): Promise<void> {
    if (!guild.kookBotToken || !guild.kookGuildId) return;

    try {
      const info = await this.kookService.getGuildView(guild.kookGuildId, guild.kookBotToken);
      await this.guildRepo.update(guild.id, {
        name: info.name || guild.name,
        iconUrl: info.icon || guild.iconUrl,
      });
      this.logger.log(`[${guild.name}] 服务器信息已同步: name=${info.name}, icon=${info.icon ? '有' : '无'}`);
    } catch (err) {
      this.logger.error(`[${guild.name}] 同步服务器信息失败: ${err}`);
    }
  }

  /** 同步成员列表（快照对比，检测加入/离开） */
  async syncGuildMembers(guild: Guild) {
    if (!guild.kookBotToken || !guild.kookGuildId) {
      this.logger.warn(`公会 ${guild.name} 未配置 KOOK token/guild_id`);
      return { added: 0, updated: 0, left: 0 };
    }

    const [kookMembers, kookRoles] = await Promise.all([
      this.kookService.getGuildMemberList(guild.kookGuildId, guild.kookBotToken),
      this.kookService.getGuildRoleList(guild.kookGuildId, guild.kookBotToken),
    ]);
    const roleMap = new Map(kookRoles.map(r => [r.role_id, r.name]));
    const existingMembers = await this.memberRepo.find({ where: { guildId: guild.id } });
    const existingMap = new Map(existingMembers.map((m) => [m.kookUserId, m]));
    const kookIdSet = new Set(kookMembers.map((m) => m.id));

    let added = 0, updated = 0, left = 0;

    for (const km of kookMembers) {
      // 将角色ID数组映射为 {role_id, name} 对象数组
      const mappedRoles = (km.roles || []).map(rid => ({
        role_id: rid,
        name: roleMap.get(rid) || `角色${rid}`,
      }));
      const existing = existingMap.get(km.id);
      if (existing) {
        existing.nickname = km.nickname || km.username || existing.nickname;
        existing.kookRoles = mappedRoles;
        existing.lastSyncedAt = new Date();
        if (existing.status === MemberStatus.LEFT) {
          existing.status = MemberStatus.ACTIVE;
          existing.leftAt = null;
          existing.joinedAt = new Date();
        }
        await this.memberRepo.save(existing);
        updated++;
      } else {
        await this.memberRepo.save(this.memberRepo.create({
          guildId: guild.id,
          kookUserId: km.id,
          nickname: km.nickname || km.username,
          kookRoles: mappedRoles,
          role: 'normal',
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
          lastSyncedAt: new Date(),
        }));
        added++;
      }
    }

    for (const [kookId, member] of existingMap) {
      if (!kookIdSet.has(kookId) && member.status === MemberStatus.ACTIVE) {
        member.status = MemberStatus.LEFT;
        member.leftAt = new Date();
        member.lastSyncedAt = new Date();
        await this.memberRepo.save(member);
        left++;
      }
    }

    this.logger.log(`[${guild.name}] 同步完成: +${added} ~${updated} -${left}`);
    return { added, updated, left };
  }

  /** 拉取频道新消息（增量，基于游标） */
  async pollChannelMessages(guild: Guild, channelId: string): Promise<any[]> {
    if (!guild.kookBotToken) return [];

    try {
      const messages = await this.kookService.getChannelMessages(
        channelId,
        guild.kookLastMessageId || undefined,
        'after',
        50,
        guild.kookBotToken,
      );

      if (messages.length > 0) {
        // 更新游标为最新消息 ID
        const latestMsgId = messages[messages.length - 1].id;
        await this.guildRepo.update(guild.id, { kookLastMessageId: latestMsgId });
        this.logger.log(`[${guild.name}] 拉取到 ${messages.length} 条新消息，游标更新为 ${latestMsgId}`);
      }

      return messages;
    } catch (err) {
      this.logger.error(`[${guild.name}] 拉取消息失败: ${err}`);
      return [];
    }
  }
}

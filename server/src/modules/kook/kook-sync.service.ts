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
    if (!guild.kookGuildId || guild.kookGuildId.startsWith('test-')) return;

    try {
      const effectiveToken = this.getEffectiveToken(guild);
      const info = await this.kookService.getGuildView(guild.kookGuildId, effectiveToken);
      await this.guildRepo.update(guild.id, {
        name: info.name || guild.name,
        iconUrl: info.icon || guild.iconUrl,
      });
      this.logger.log(`[${guild.name}] 服务器信息已同步: name=${info.name}, icon=${info.icon ? '有' : '无'}`);
    } catch (err) {
      this.logger.error(`[${guild.name}] 同步服务器信息失败: ${err}`);
    }
  }

  /** 根据 KOOK 服务器 ID 查找公会（用于获取公会独立 Token） */
  async findGuildByKookId(kookGuildId: string): Promise<Guild | null> {
    return this.guildRepo.findOne({ where: { kookGuildId } });
  }

  /** 获取公会有效 Token（优先公会独立Token，fallback全局Token） */
  private getEffectiveToken(guild: Guild): string | undefined {
    // 如果公会 Token 是假数据（test-开头）则忽略
    if (guild.kookBotToken && !guild.kookBotToken.startsWith('test-')) {
      return guild.kookBotToken;
    }
    return undefined; // 使用全局 Token（KookService 内部 fallback）
  }

  /** 同步成员列表（快照对比，检测加入/离开） */
  async syncGuildMembers(guild: Guild) {
    if (!guild.kookGuildId || guild.kookGuildId.startsWith('test-')) {
      this.logger.warn(`公会 ${guild.name} 未配置有效的 KOOK guild_id（当前值: ${guild.kookGuildId}）`);
      return { added: 0, updated: 0, left: 0 };
    }

    const effectiveToken = this.getEffectiveToken(guild);
    const [kookMembers, kookRoles] = await Promise.all([
      this.kookService.getGuildMemberList(guild.kookGuildId, effectiveToken),
      this.kookService.getGuildRoleList(guild.kookGuildId, effectiveToken),
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
        // 保护：super_admin 不自动标记为离开（可能是数据源问题而非真正离开）
        if (member.role === 'super_admin') {
          this.logger.warn(`[${guild.name}] 超管 ${member.nickname}(${kookId}) 不在KOOK成员列表中，跳过离开标记`);
          continue;
        }
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

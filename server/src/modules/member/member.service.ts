import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { GuildMember } from './entities/guild-member.entity';
import { AlbionGuildMember } from './entities/albion-guild-member.entity';
import { MemberAlbionBinding } from './entities/member-albion-binding.entity';
import { Guild } from '../guild/entities/guild.entity';
import { AlbionService } from '../albion/albion.service';
import { QueryMemberDto } from './dto/member.dto';
import { MemberStatus, GuildRole } from '../../common/constants/enums';

@Injectable()
export class MemberService {
  private readonly logger = new Logger(MemberService.name);

  constructor(
    @InjectRepository(GuildMember)
    private memberRepo: Repository<GuildMember>,
    @InjectRepository(AlbionGuildMember)
    private albionMemberRepo: Repository<AlbionGuildMember>,
    @InjectRepository(MemberAlbionBinding)
    private bindingRepo: Repository<MemberAlbionBinding>,
    @InjectRepository(Guild)
    private guildRepo: Repository<Guild>,
    private albionService: AlbionService,
  ) {}

  async findAll(guildId: number, query: QueryMemberDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const qb = this.memberRepo
      .createQueryBuilder('m')
      .where('m.guildId = :guildId', { guildId });

    if (query.status === 'active')
      qb.andWhere('m.status = :s', { s: MemberStatus.ACTIVE });
    else if (query.status === 'left')
      qb.andWhere('m.status = :s', { s: MemberStatus.LEFT });

    if (query.keyword) {
      qb.andWhere('(m.nickname LIKE :kw OR m.kookUserId LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    // F-101: KOOK 角色过滤（kook_roles JSON 中匹配 role_id）
    // kookRoles 存储格式: [{ "role_id": 123, "name": "XXX" }, ...]
    // V2.9.9: __no_role__ 特殊值过滤无服务器角色的成员（排除非KOOK绑定账号）
    if (query.kookRoleId) {
      if (query.kookRoleId === '__no_role__') {
        qb.andWhere(
          `(m.kookRoles IS NULL OR JSON_LENGTH(m.kookRoles) = 0 OR m.kookRoles = '[]')`,
        )
          .andWhere(`m.kookUserId != ''`)
          .andWhere(`m.joinSource != 'manual'`);
      } else {
        const roleIdNum = Number(query.kookRoleId);
        if (!isNaN(roleIdNum)) {
          qb.andWhere(`JSON_CONTAINS(m.kookRoles, :roleJson, '$')`, {
            roleJson: JSON.stringify({ role_id: roleIdNum }),
          });
        }
      }
    }

    qb.orderBy('m.status', 'ASC').addOrderBy('m.updatedAt', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async getDailyStatistics(guildId: number) {
    // V2.9.8: 今天0点~明天0点（之前是昨天0点~今天0点，漏掉今天同步的新成员）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const totalActive = await this.memberRepo.count({
      where: { guildId, status: MemberStatus.ACTIVE },
    });

    const totalLeft = await this.memberRepo.count({
      where: { guildId, status: MemberStatus.LEFT },
    });

    const newMembers = await this.memberRepo.find({
      where: {
        guildId,
        status: MemberStatus.ACTIVE,
        joinedAt: Between(todayStart, tomorrowStart),
      },
      order: { joinedAt: 'DESC' },
    });

    const leftMembers = await this.memberRepo.find({
      where: {
        guildId,
        status: MemberStatus.LEFT,
        leftAt: Between(todayStart, tomorrowStart),
      },
      order: { leftAt: 'DESC' },
    });

    const lastSynced = await this.memberRepo.findOne({
      where: { guildId },
      order: { lastSyncedAt: 'DESC' },
      select: ['lastSyncedAt'],
    });

    return {
      totalActive,
      totalLeft,
      totalAll: totalActive + totalLeft,
      dailyNew: newMembers.length,
      dailyLeft: leftMembers.length,
      newMembers: newMembers.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        kookUserId: m.kookUserId,
        joinedAt: m.joinedAt,
      })),
      leftMembers: leftMembers.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        kookUserId: m.kookUserId,
        leftAt: m.leftAt,
      })),
      lastSyncedAt: lastSynced?.lastSyncedAt || null,
    };
  }

  async syncFromKook(
    guildId: number,
    kookMembers: { id: string; nickname: string; roles: any[] }[],
  ) {
    this.logger.log(`[公会${guildId}] 开始同步 ${kookMembers.length} 个成员`);
    let added = 0;
    let updated = 0;
    let left = 0;

    const existingMembers = await this.memberRepo.find({ where: { guildId } });
    const existingMap = new Map(existingMembers.map((m) => [m.kookUserId, m]));
    const kookIdSet = new Set(kookMembers.map((km) => km.id));

    // 新增或更新在会成员
    for (const km of kookMembers) {
      const existing = existingMap.get(km.id);
      if (existing) {
        existing.nickname = km.nickname || km['username'] || existing.nickname;
        existing.kookRoles = km.roles;
        existing.lastSyncedAt = new Date();
        if (existing.status === MemberStatus.LEFT) {
          existing.status = MemberStatus.ACTIVE;
          existing.leftAt = null;
          existing.joinedAt = new Date();
        }
        await this.memberRepo.save(existing);
        updated++;
      } else {
        const member = this.memberRepo.create({
          guildId,
          kookUserId: km.id,
          nickname: km.nickname || km.id,
          kookRoles: km.roles,
          role: 'normal',
          status: MemberStatus.ACTIVE,
          joinedAt: new Date(),
          lastSyncedAt: new Date(),
        });
        await this.memberRepo.save(member);
        added++;
      }
    }

    // 标记离开的成员
    for (const [kookId, member] of existingMap) {
      if (!kookIdSet.has(kookId) && member.status === MemberStatus.ACTIVE) {
        // V2.9.8: 保护非KOOK来源账号（手动创建的虚拟账号）
        if (member.joinSource === 'manual' || !/^\d+$/.test(kookId)) {
          continue;
        }
        member.status = MemberStatus.LEFT;
        member.leftAt = new Date();
        member.lastSyncedAt = new Date();
        await this.memberRepo.save(member);
        left++;
      }
    }

    this.logger.log(
      `[公会${guildId}] 同步完成: 新增${added} 更新${updated} 离开${left}`,
    );
    return { added, updated, left, total: kookMembers.length };
  }

  async findAlbionMembers(guildId: number, query: QueryMemberDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const qb = this.albionMemberRepo
      .createQueryBuilder('a')
      .leftJoin(
        MemberAlbionBinding,
        'b',
        'b.guild_id = a.guild_id AND b.albion_player_id = a.player_id AND b.status = :bindStatus',
        { bindStatus: 'active' },
      )
      .where('a.guildId = :guildId', { guildId })
      .select('a')
      .addSelect('b.guild_member_id', 'bindGuildMemberId')
      .addSelect('b.kook_user_id', 'bindKookUserId')
      .addSelect('b.kook_nickname', 'bindKookNickname');

    if (query.status === 'active')
      qb.andWhere('a.status = :s', { s: MemberStatus.ACTIVE });
    else if (query.status === 'left')
      qb.andWhere('a.status = :s', { s: MemberStatus.LEFT });
    if (query.keyword)
      qb.andWhere('(a.playerName LIKE :kw OR a.playerId LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });

    qb.orderBy('a.status', 'ASC').addOrderBy('a.updatedAt', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const { entities, raw } = await qb.getRawAndEntities();
    // getRawAndEntities 返回 raw 中列名格式为 a_player_id，addSelect 别名为 bindXxx
    // 用 raw 数组索引与 entities 对应（TypeORM 保证两者顺序一致）
    const list = entities.map((item, index) => ({
      ...item,
      kookNickname: raw[index]?.bindKookNickname || null,
      kookUserId: raw[index]?.bindKookUserId || null,
      boundGuildMemberId: raw[index]?.bindGuildMemberId || null,
    }));
    const total = await qb.getCount();
    return { list, total, page, pageSize };
  }

  async searchKookMembers(guildId: number, keyword = '') {
    const qb = this.memberRepo
      .createQueryBuilder('m')
      .where('m.guildId = :guildId', { guildId })
      .andWhere('m.status = :status', { status: MemberStatus.ACTIVE });
    if (keyword)
      qb.andWhere('(m.nickname LIKE :kw OR m.kookUserId LIKE :kw)', {
        kw: `%${keyword}%`,
      });
    return qb.orderBy('m.nickname', 'ASC').take(30).getMany();
  }

  async syncAlbionGuildMembers(guildId: number) {
    const guild = await this.guildRepo.findOne({ where: { id: guildId } });
    if (!guild) throw new NotFoundException('公会不存在');
    // Bug5 修复：不再硬编码 PSC 公会ID，必须从公会配置读取
    const albionGuildId = guild.albionGuildId;
    const albionGuildName = guild.albionGuildName || guild.name;
    const albionServer = guild.albionServer || 'sgp';
    if (!albionGuildId) throw new BadRequestException('请先在公会设置中配置 Albion 公会ID');

    const now = new Date();
    const remoteMembers = await this.albionService.getGuildMembers(
      albionServer,
      albionGuildId,
    );
    const existing = await this.albionMemberRepo.find({ where: { guildId } });
    const existingMap = new Map(existing.map((m) => [m.playerId, m]));
    const remoteIdSet = new Set(remoteMembers.map((m) => m.Id));
    let added = 0,
      updated = 0,
      left = 0,
      autoBound = 0;

    for (const rm of remoteMembers) {
      let record = existingMap.get(rm.Id);
      if (record) {
        record.playerName = rm.Name || record.playerName;
        record.albionGuildId = rm.GuildId || albionGuildId;
        record.albionGuildName = rm.GuildName || albionGuildName;
        record.allianceId = rm.AllianceId || null;
        record.allianceName = rm.AllianceName || null;
        record.killFame = rm.KillFame || 0;
        record.deathFame = rm.DeathFame || 0;
        record.status = MemberStatus.ACTIVE;
        record.leftAt = null;
        record.lastSyncedAt = now;
        updated++;
      } else {
        record = this.albionMemberRepo.create({
          guildId,
          albionServer,
          albionGuildId: rm.GuildId || albionGuildId,
          albionGuildName: rm.GuildName || albionGuildName,
          playerId: rm.Id,
          playerName: rm.Name,
          allianceId: rm.AllianceId || null,
          allianceName: rm.AllianceName || null,
          killFame: rm.KillFame || 0,
          deathFame: rm.DeathFame || 0,
          status: MemberStatus.ACTIVE,
          joinedAt: now,
          lastSyncedAt: now,
        });
        added++;
      }
      await this.albionMemberRepo.save(record);
      const bound = await this.tryAutoBindByNickname(
        guildId,
        record.playerId,
        record.playerName,
      );
      if (bound) autoBound++;
    }

    for (const old of existing) {
      if (
        !remoteIdSet.has(old.playerId) &&
        old.status === MemberStatus.ACTIVE
      ) {
        old.status = MemberStatus.LEFT;
        old.leftAt = now;
        old.lastSyncedAt = now;
        await this.albionMemberRepo.save(old);
        left++;
      }
    }

    guild.albionServer = albionServer;
    guild.albionGuildId = albionGuildId;
    guild.albionGuildName = albionGuildName;
    guild.albionMembersLastSyncedAt = now;
    await this.guildRepo.save(guild);

    this.logger.log(
      `[公会${guildId}] Albion成员同步完成: 新增${added} 更新${updated} 离开${left} 自动绑定${autoBound}`,
    );
    return { added, updated, left, autoBound, total: remoteMembers.length };
  }

  async syncAllAlbionGuildMembers() {
    // Bug5 修复：不再硬编码 PSC 公会ID，只同步已配置 albionGuildId 的公会
    const guilds = await this.guildRepo.find({ where: { status: 1 } });
    const guildsToSync = guilds.filter(
      (g) => g.albionGuildId && g.albionGuildId.trim() !== '',
    );
    let synced = 0;
    for (const guild of guildsToSync) {
      try {
        await this.syncAlbionGuildMembers(guild.id);
        synced++;
      } catch (err) {
        this.logger.warn(`[${guild.name}] Albion成员同步失败: ${err}`);
      }
    }
    return { synced };
  }

  private async tryAutoBindByNickname(
    guildId: number,
    albionPlayerId: string,
    albionPlayerName: string,
  ): Promise<boolean> {
    const existing = await this.bindingRepo.findOne({
      where: { guildId, albionPlayerId, status: 'active' },
    });
    if (existing) return false;
    const kookMember = await this.memberRepo.findOne({
      where: {
        guildId,
        nickname: albionPlayerName,
        status: MemberStatus.ACTIVE,
      },
    });
    if (!kookMember) return false;
    await this.bindingRepo.save(
      this.bindingRepo.create({
        guildId,
        guildMemberId: kookMember.id,
        kookUserId: kookMember.kookUserId,
        kookNickname: kookMember.nickname,
        albionPlayerId,
        albionPlayerName,
        bindType: 'auto',
        status: 'active',
      }),
    );
    return true;
  }

  async bindAlbionMember(
    guildId: number,
    albionPlayerId: string,
    guildMemberId: number,
  ) {
    const albion = await this.albionMemberRepo.findOne({
      where: { guildId, playerId: albionPlayerId },
    });
    if (!albion) throw new NotFoundException('Albion成员不存在');
    const member = await this.memberRepo.findOne({
      where: { guildId, id: guildMemberId },
    });
    if (!member) throw new NotFoundException('KOOK成员不存在');
    let binding = await this.bindingRepo.findOne({
      where: { guildId, albionPlayerId },
    });
    if (!binding)
      binding = this.bindingRepo.create({
        guildId,
        albionPlayerId,
        albionPlayerName: albion.playerName,
      });
    binding.guildMemberId = member.id;
    binding.kookUserId = member.kookUserId;
    binding.kookNickname = member.nickname;
    binding.albionPlayerName = albion.playerName;
    binding.bindType = 'manual';
    binding.status = 'active';
    return this.bindingRepo.save(binding);
  }

  async updateRole(guildId: number, memberId: number, role: string) {
    const validRoles = [
      GuildRole.SUPER_ADMIN,
      GuildRole.INVENTORY_ADMIN,
      GuildRole.RESUPPLY_STAFF,
      GuildRole.NORMAL,
    ];
    if (!validRoles.includes(role as GuildRole)) {
      throw new BadRequestException(
        `无效角色，可选值：${validRoles.join(', ')}`,
      );
    }

    const member = await this.memberRepo.findOne({
      where: { id: memberId, guildId },
    });
    if (!member) throw new NotFoundException('成员不存在');

    const oldRole = member.role;
    member.role = role;
    await this.memberRepo.save(member);

    this.logger.log(
      `[公会${guildId}] 成员 ${member.nickname}(${memberId}) 角色变更: ${oldRole} → ${role}`,
    );
    return { id: memberId, role, oldRole };
  }
}

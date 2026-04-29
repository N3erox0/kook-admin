import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between, MoreThanOrEqual } from 'typeorm';
import { GuildMember } from './entities/guild-member.entity';
import { QueryMemberDto } from './dto/member.dto';
import { MemberStatus, GuildRole } from '../../common/constants/enums';

@Injectable()
export class MemberService {
  private readonly logger = new Logger(MemberService.name);

  constructor(
    @InjectRepository(GuildMember)
    private memberRepo: Repository<GuildMember>,
  ) {}

  async findAll(guildId: number, query: QueryMemberDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const qb = this.memberRepo.createQueryBuilder('m')
      .where('m.guildId = :guildId', { guildId });

    if (query.status === 'active') qb.andWhere('m.status = :s', { s: MemberStatus.ACTIVE });
    else if (query.status === 'left') qb.andWhere('m.status = :s', { s: MemberStatus.LEFT });

    if (query.keyword) {
      qb.andWhere('(m.nickname LIKE :kw OR m.kookUserId LIKE :kw)', { kw: `%${query.keyword}%` });
    }

    // F-101: KOOK 角色过滤（kook_roles JSON 中匹配 role_id）
    // kookRoles 存储格式: [{ "role_id": 123, "name": "XXX" }, ...]
    // V2.9.9: __no_role__ 特殊值过滤无服务器角色的成员（排除非KOOK绑定账号）
    if (query.kookRoleId) {
      if (query.kookRoleId === '__no_role__') {
        qb.andWhere(`(m.kookRoles IS NULL OR JSON_LENGTH(m.kookRoles) = 0 OR m.kookRoles = '[]')`)
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
      newMembers: newMembers.map((m) => ({ id: m.id, nickname: m.nickname, kookUserId: m.kookUserId, joinedAt: m.joinedAt })),
      leftMembers: leftMembers.map((m) => ({ id: m.id, nickname: m.nickname, kookUserId: m.kookUserId, leftAt: m.leftAt })),
      lastSyncedAt: lastSynced?.lastSyncedAt || null,
    };
  }

  async syncFromKook(guildId: number, kookMembers: { id: string; nickname: string; roles: any[] }[]) {
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

    this.logger.log(`[公会${guildId}] 同步完成: 新增${added} 更新${updated} 离开${left}`);
    return { added, updated, left, total: kookMembers.length };
  }

  async updateRole(guildId: number, memberId: number, role: string) {
    const validRoles = [GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN, GuildRole.RESUPPLY_STAFF, GuildRole.NORMAL];
    if (!validRoles.includes(role as GuildRole)) {
      throw new BadRequestException(`无效角色，可选值：${validRoles.join(', ')}`);
    }

    const member = await this.memberRepo.findOne({ where: { id: memberId, guildId } });
    if (!member) throw new NotFoundException('成员不存在');

    const oldRole = member.role;
    member.role = role;
    await this.memberRepo.save(member);

    this.logger.log(`[公会${guildId}] 成员 ${member.nickname}(${memberId}) 角色变更: ${oldRole} → ${role}`);
    return { id: memberId, role, oldRole };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';
import { GuildMember } from '../member/entities/guild-member.entity';
import { GuildInventory } from '../equipment/entities/guild-inventory.entity';
import { GuildResupply } from '../resupply/entities/guild-resupply.entity';
import { GuildAlertRecord } from '../alert/entities/guild-alert-record.entity';
import { MemberStatus, ResupplyStatus } from '../../common/constants/enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
    @InjectRepository(GuildInventory) private invRepo: Repository<GuildInventory>,
    @InjectRepository(GuildResupply) private resupplyRepo: Repository<GuildResupply>,
    @InjectRepository(GuildAlertRecord) private alertRepo: Repository<GuildAlertRecord>,
  ) {}

  async getOverview(guildId: number) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const totalActive = await this.memberRepo.count({ where: { guildId, status: MemberStatus.ACTIVE } });

    // 新增成员列表（最近24小时加入）
    const newMembers = await this.memberRepo.find({
      where: { guildId, status: MemberStatus.ACTIVE, joinedAt: MoreThanOrEqual(yesterdayStart) },
      order: { joinedAt: 'DESC' },
    });

    // 离开成员列表（最近24小时离开）
    const leftMembers = await this.memberRepo.find({
      where: { guildId, status: MemberStatus.LEFT, leftAt: MoreThanOrEqual(yesterdayStart) },
      order: { leftAt: 'DESC' },
    });

    const pendingResupply = await this.resupplyRepo.count({ where: { guildId, status: ResupplyStatus.PENDING } });
    const unresolvedAlerts = await this.alertRepo.count({ where: { guildId, isResolved: 0 } });

    const totalInventory = await this.invRepo.createQueryBuilder('inv')
      .select('SUM(inv.quantity)', 'total')
      .where('inv.guildId = :guildId', { guildId })
      .getRawOne();

    // 统计时间 = 上次获取 KOOK 成员的时间
    const lastSyncedMember = await this.memberRepo.findOne({
      where: { guildId },
      order: { lastSyncedAt: 'DESC' },
    });

    return {
      totalActive,
      dailyNew: newMembers.length,
      dailyLeft: leftMembers.length,
      newMembers: newMembers.map((m) => ({ id: m.id, nickname: m.nickname, kookUserId: m.kookUserId, joinedAt: m.joinedAt })),
      leftMembers: leftMembers.map((m) => ({ id: m.id, nickname: m.nickname, kookUserId: m.kookUserId, leftAt: m.leftAt })),
      pendingResupply,
      unresolvedAlerts,
      totalInventory: parseInt(totalInventory?.total || '0'),
      lastSyncedAt: lastSyncedMember?.lastSyncedAt || null,
    };
  }
}

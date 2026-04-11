import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Between } from 'typeorm';
import { GuildMember } from '../member/entities/guild-member.entity';
import { GuildInventory } from '../equipment/entities/guild-inventory.entity';
import { GuildResupply } from '../resupply/entities/guild-resupply.entity';
import { GuildAlertRecord } from '../alert/entities/guild-alert-record.entity';
import { Guild } from '../guild/entities/guild.entity';
import { InviteCode } from '../guild/entities/invite-code.entity';
import { User } from '../user/entities/user.entity';
import { MemberStatus, ResupplyStatus, InviteCodeStatus } from '../../common/constants/enums';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
    @InjectRepository(GuildInventory) private invRepo: Repository<GuildInventory>,
    @InjectRepository(GuildResupply) private resupplyRepo: Repository<GuildResupply>,
    @InjectRepository(GuildAlertRecord) private alertRepo: Repository<GuildAlertRecord>,
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(InviteCode) private inviteCodeRepo: Repository<InviteCode>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // ===== 模块一：系统超管控制台 =====

  async getAdminOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // 公会总数 + 较昨日趋势
    const totalGuilds = await this.guildRepo.count({ where: { status: 1 } });
    const guildsYesterday = await this.guildRepo.createQueryBuilder('g')
      .where('g.status = 1')
      .andWhere('g.created_at < :today', { today: todayStart })
      .getCount();
    const guildsTrend = totalGuilds - guildsYesterday;

    // 注册用户数
    const totalUsers = await this.userRepo.count({ where: { status: 1 } });

    // 活跃机器人（有 kookBotToken 且 status=1 的公会数）
    const activeBots = await this.guildRepo.createQueryBuilder('g')
      .where('g.status = 1')
      .andWhere('g.kook_bot_token IS NOT NULL')
      .andWhere('g.kook_bot_token != :empty', { empty: '' })
      .getCount();

    // 今日邀请码核销数
    const todayRedeemed = await this.inviteCodeRepo.createQueryBuilder('ic')
      .where('ic.status = :status', { status: InviteCodeStatus.USED })
      .andWhere('ic.used_at >= :today', { today: todayStart })
      .getCount();

    // 最新入驻公会（最近5个）
    const recentGuilds = await this.guildRepo.find({
      where: { status: GuildStatus.ACTIVE },
      order: { createdAt: 'DESC' },
      take: 5,
      relations: ['owner'],
    });

    // 异常监控：近 24 小时内没有成功同步的活跃公会（有 bot token 但 last_synced_at 为空或超过 24 小时）
    const allActiveGuilds = await this.guildRepo.find({
      where: { status: 1 },
    });
    const anomalyGuilds: { id: number; name: string; reason: string }[] = [];
    for (const g of allActiveGuilds) {
      if (g.kookBotToken) {
        const latestSync = await this.memberRepo.findOne({
          where: { guildId: g.id },
          order: { lastSyncedAt: 'DESC' },
        });
        if (!latestSync || !latestSync.lastSyncedAt) {
          anomalyGuilds.push({ id: g.id, name: g.name, reason: '从未同步' });
        } else {
          const hoursSinceSync = (now.getTime() - new Date(latestSync.lastSyncedAt).getTime()) / (1000 * 60 * 60);
          if (hoursSinceSync > 25) {
            anomalyGuilds.push({ id: g.id, name: g.name, reason: `超过 ${Math.round(hoursSinceSync)}h 未同步` });
          }
        }
      }
    }

    return {
      totalGuilds,
      guildsTrend,
      totalUsers,
      activeBots,
      todayRedeemed,
      recentGuilds: recentGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        ownerName: g.owner?.nickname || g.owner?.username || '-',
        kookGuildId: g.kookGuildId,
      })),
      anomalyGuilds,
    };
  }

  // ===== 模块二：公会管理员控制台 =====

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
      newMembers: newMembers.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        kookUserId: m.kookUserId,
        kookRoles: m.kookRoles,
        joinedAt: m.joinedAt,
      })),
      leftMembers: leftMembers.map((m) => ({
        id: m.id,
        nickname: m.nickname,
        kookUserId: m.kookUserId,
        kookRoles: m.kookRoles,
        leftAt: m.leftAt,
      })),
      pendingResupply,
      unresolvedAlerts,
      totalInventory: parseInt(totalInventory?.total || '0'),
      lastSyncedAt: lastSyncedMember?.lastSyncedAt || null,
    };
  }
}

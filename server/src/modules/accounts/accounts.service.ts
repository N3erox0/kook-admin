import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { hashPassword } from '../../common/utils/crypto.util';
import { CreateAccountDto, UpdateAccountDto, ResetAccountPasswordDto, QueryAccountsDto } from './dto/accounts.dto';

/**
 * V3.2 公会维度的"登录账号"管理
 * 列表合并查询：当前公会所有 guild_members + 关联的 users，识别 4 种来源：
 *  - kook_oauth：通过 KOOK OAuth 注册（user.kookUserId 非空）
 *  - invite_code：通过邀请码加入（guild_members.joinSource='invite_link'）
 *  - kook_sync：KOOK 服务器同步导入（guild_members.joinSource='kook_sync'）
 *  - manual：管理员手动创建（guild_members.joinSource='manual'，本期新增）
 */
@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
  ) {}

  /** 推断账号来源 */
  private inferSource(member: GuildMember, user: User | null): string {
    if (member.joinSource === 'manual') return 'manual';
    if (member.joinSource === 'invite_link') return 'invite_code';
    if (user?.kookUserId) return 'kook_oauth';
    return member.joinSource || 'kook_sync';
  }

  /** 列表查询（按公会维度） */
  async list(guildId: number, query: QueryAccountsDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 50;

    const qb = this.memberRepo
      .createQueryBuilder('gm')
      .where('gm.guildId = :guildId', { guildId });

    if (query.keyword) {
      qb.andWhere('(gm.nickname LIKE :kw OR gm.kookUserId LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }
    if (query.source) {
      if (query.source === 'manual') qb.andWhere(`gm.joinSource = 'manual'`);
      else if (query.source === 'invite_code') qb.andWhere(`gm.joinSource = 'invite_link'`);
      else if (query.source === 'kook_sync') qb.andWhere(`gm.joinSource IN ('kook_sync','webhook')`);
      else if (query.source === 'kook_oauth') qb.andWhere(`gm.userId IS NOT NULL AND gm.joinSource NOT IN ('manual','invite_link')`);
    }

    qb.orderBy('gm.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [members, total] = await qb.getManyAndCount();

    // 批量查 users
    const userIds = Array.from(new Set(members.map((m) => m.userId).filter(Boolean) as number[]));
    const users = userIds.length
      ? await this.userRepo.findBy(userIds.map((id) => ({ id })))
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const list = members.map((m) => {
      const user = m.userId ? userMap.get(m.userId) || null : null;
      return {
        id: m.id, // guild_members.id
        userId: m.userId,
        username: user?.username || null,
        nickname: m.nickname || user?.nickname || null,
        kookUserId: m.kookUserId || null,
        role: m.role,
        status: user?.status ?? (m.status === 'active' ? 1 : 0),
        memberStatus: m.status, // active / left
        source: this.inferSource(m, user),
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        lastLoginAt: user?.lastLoginAt || null,
        createdAt: m.createdAt,
      };
    });

    return { list, total, page, pageSize };
  }

  /** 手动创建账号（创建即绑公会，不依赖 KOOK/Albion） */
  async createManual(guildId: number, dto: CreateAccountDto) {
    // 用户名查重
    const existsUser = await this.userRepo.findOne({ where: { username: dto.username } });
    if (existsUser) throw new ConflictException(`用户名 ${dto.username} 已存在`);

    // 创建 user
    const user = this.userRepo.create({
      username: dto.username,
      passwordHash: await hashPassword(dto.password),
      nickname: dto.nickname || dto.username,
      status: 1,
    });
    const savedUser = await this.userRepo.save(user);

    // 生成"伪 KOOK ID"占位（避免唯一索引冲突）：manual_<guildId>_<userId>_<random>
    const fakeKookId = `manual_${guildId}_${savedUser.id}_${Math.random().toString(36).slice(2, 8)}`;

    // 创建 guild_members（joinSource=manual）
    const member = this.memberRepo.create({
      guildId,
      userId: savedUser.id,
      kookUserId: fakeKookId,
      nickname: dto.nickname || dto.username,
      role: dto.role,
      status: 'active',
      joinSource: 'manual',
      joinedAt: new Date(),
    });
    const savedMember = await this.memberRepo.save(member);

    return {
      id: savedMember.id,
      userId: savedUser.id,
      username: savedUser.username,
      role: savedMember.role,
      source: 'manual',
    };
  }

  /** 修改账号（角色/启停） */
  async update(guildId: number, memberId: number, dto: UpdateAccountDto) {
    const member = await this.memberRepo.findOne({ where: { id: memberId, guildId } });
    if (!member) throw new NotFoundException('账号不存在');

    if (dto.role !== undefined) {
      member.role = dto.role;
      await this.memberRepo.save(member);
    }
    if (dto.status !== undefined && member.userId) {
      const user = await this.userRepo.findOne({ where: { id: member.userId } });
      if (user) {
        user.status = dto.status;
        await this.userRepo.save(user);
      }
    }
    return { ok: true };
  }

  /** 重置密码（仅手动/有关联 user 的账号可重置） */
  async resetPassword(guildId: number, memberId: number, dto: ResetAccountPasswordDto) {
    const member = await this.memberRepo.findOne({ where: { id: memberId, guildId } });
    if (!member) throw new NotFoundException('账号不存在');
    if (!member.userId) {
      throw new BadRequestException('该 KOOK 同步账号没有关联登录账号，无法重置密码');
    }
    const user = await this.userRepo.findOne({ where: { id: member.userId } });
    if (!user) throw new NotFoundException('关联用户不存在');
    user.passwordHash = await hashPassword(dto.newPassword);
    await this.userRepo.save(user);
    return { ok: true };
  }
}

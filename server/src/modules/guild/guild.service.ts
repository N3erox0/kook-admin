import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Guild } from './entities/guild.entity';
import { InviteCode } from './entities/invite-code.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';
import { CreateGuildDto, UpdateGuildDto, GenerateInviteCodesDto, UpdateMemberRoleDto, UpdateInviteCodeStatusDto } from './dto/guild.dto';
import { GuildRole, InviteCodeStatus, GuildStatus } from '../../common/constants/enums';
import { hashPassword } from '../../common/utils/crypto.util';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GuildService {
  private readonly logger = new Logger(GuildService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(InviteCode) private inviteRepo: Repository<InviteCode>,
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
  ) {}

  // ===== 邀请码系统（v4重构） =====

  /** 验证邀请码是否可用 */
  async validateInviteCode(code: string): Promise<{ valid: boolean; message: string }> {
    const invite = await this.inviteRepo.findOne({ where: { code } });
    if (!invite) return { valid: false, message: '邀请码不存在' };
    if (invite.status !== InviteCodeStatus.ENABLED) {
      const statusLabels: Record<string, string> = {
        used: '邀请码已被使用',
        disabled: '邀请码未启用',
        revoked: '邀请码已作废',
      };
      return { valid: false, message: statusLabels[invite.status] || '邀请码无效' };
    }
    return { valid: true, message: '邀请码有效' };
  }

  /** 批量生成邀请码 */
  async generateInviteCodes(dto: GenerateInviteCodesDto, userId: number): Promise<InviteCode[]> {
    const codes: InviteCode[] = [];
    const prefix = dto.prefix || 'KOOK';
    for (let i = 0; i < dto.count; i++) {
      const code = `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
      const invite = this.inviteRepo.create({
        code,
        status: InviteCodeStatus.DISABLED, // 默认未启用，需手动启用
        createdBy: userId,
        remark: dto.remark || null,
      });
      codes.push(await this.inviteRepo.save(invite));
    }
    this.logger.log(`生成 ${dto.count} 个邀请码, 操作人: ${userId}`);
    return codes;
  }

  /** 获取所有邀请码列表 */
  async getAllInviteCodes(): Promise<InviteCode[]> {
    return this.inviteRepo.find({ order: { createdAt: 'DESC' } });
  }

  /** 修改邀请码状态 */
  async updateInviteCodeStatus(id: number, dto: UpdateInviteCodeStatusDto): Promise<InviteCode> {
    const invite = await this.inviteRepo.findOne({ where: { id } });
    if (!invite) throw new NotFoundException('邀请码不存在');

    // 已使用的邀请码不允许修改状态
    if (invite.status === InviteCodeStatus.USED) {
      throw new ForbiddenException('已使用的邀请码无法修改状态');
    }

    invite.status = dto.status;
    return this.inviteRepo.save(invite);
  }

  /** 获取单个邀请码详情 */
  async getInviteCodeById(id: number): Promise<InviteCode> {
    const invite = await this.inviteRepo.findOne({ where: { id } });
    if (!invite) throw new NotFoundException('邀请码不存在');
    return invite;
  }

  // ===== 公会 =====

  async createGuild(dto: CreateGuildDto, userId: number): Promise<Guild> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. 悲观锁验证邀请码（防止双花）
      const invite = await qr.manager.findOne(InviteCode, {
        where: { code: dto.inviteCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invite) throw new BadRequestException('邀请码不存在');
      if (invite.status !== InviteCodeStatus.ENABLED) {
        throw new BadRequestException('邀请码无效或已被使用');
      }

      // 2. 检查公会名是否唯一
      const nameExists = await qr.manager.findOne(Guild, { where: { name: dto.name } });
      if (nameExists) throw new ConflictException('公会名称已被使用');

      // 3. 检查 KOOK 服务器 ID 是否已绑定
      const guildIdExists = await qr.manager.findOne(Guild, { where: { kookGuildId: dto.kookGuildId } });
      if (guildIdExists) throw new ConflictException('该 KOOK 服务器已绑定其他公会');

      // 4. 获取用户信息（包含 kookUserId）
      const user = await qr.manager.findOne(User, { where: { id: userId } });

      // 5. 创建公会
      const guild = qr.manager.create(Guild, {
        name: dto.name,
        iconUrl: dto.iconUrl || null,
        kookGuildId: dto.kookGuildId,
        ownerUserId: userId,
        inviteCodeId: invite.id,
        status: GuildStatus.ACTIVE,
      });
      const saved = await qr.manager.save(guild);

      // 6. 标记邀请码为已使用
      invite.status = InviteCodeStatus.USED;
      invite.usedByUserId = userId;
      invite.usedAt = new Date();
      invite.boundGuildId = saved.id;
      invite.boundGuildName = saved.name;
      await qr.manager.save(invite);

      // 7. 创建人绑定为超级管理员
      const member = qr.manager.create(GuildMember, {
        guildId: saved.id,
        userId,
        kookUserId: user?.kookUserId || '',
        nickname: user?.nickname || '创建者',
        role: GuildRole.SUPER_ADMIN,
        status: 'active',
        joinedAt: new Date(),
        lastSyncedAt: new Date(),
        joinSource: 'invite_link',
      });
      await qr.manager.save(member);

      await qr.commitTransaction();
      this.logger.log(`公会创建成功: ${saved.name} (ID: ${saved.id}), 邀请码: ${dto.inviteCode}`);
      return saved;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async findAllGuilds(): Promise<Guild[]> {
    return this.guildRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findGuildById(id: number): Promise<Guild> {
    const guild = await this.guildRepo.findOne({ where: { id } });
    if (!guild) throw new NotFoundException('公会不存在');
    return guild;
  }

  async findGuildsByUserId(userId: number): Promise<any[]> {
    const members = await this.memberRepo.find({
      where: { userId },
      relations: ['guild'],
    });
    return members
      .filter((m) => m.guild?.status === GuildStatus.ACTIVE)
      .map((m) => ({
        guildId: m.guildId,
        guildName: m.guild?.name,
        guildIcon: m.guild?.iconUrl,
        role: m.role,
        memberStatus: m.status,
      }));
  }

  /** SSVIP: 获取所有公会列表（仅查看） */
  async findAllGuildsForSSVIP(): Promise<any[]> {
    const guilds = await this.guildRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['owner'],
    });
    return guilds.map((g) => ({
      guildId: g.id,
      guildName: g.name,
      guildIcon: g.iconUrl,
      kookGuildId: g.kookGuildId,
      ownerName: g.owner?.nickname || g.owner?.username,
      memberCount: 0, // will be populated separately if needed
      status: g.status,
      createdAt: g.createdAt,
    }));
  }

  async updateGuild(id: number, dto: UpdateGuildDto): Promise<Guild> {
    const guild = await this.findGuildById(id);
    if (dto.name && dto.name !== guild.name) {
      const nameExists = await this.guildRepo.findOne({ where: { name: dto.name } });
      if (nameExists) throw new ConflictException('公会名称已被使用');
    }
    Object.assign(guild, dto);
    return this.guildRepo.save(guild);
  }

  async updateMemberRole(guildId: number, dto: UpdateMemberRoleDto) {
    const validRoles = [GuildRole.SUPER_ADMIN, GuildRole.INVENTORY_ADMIN, GuildRole.RESUPPLY_STAFF, GuildRole.NORMAL];
    if (!validRoles.includes(dto.role as GuildRole)) {
      throw new BadRequestException(`无效角色，可选值：${validRoles.join(', ')}`);
    }
    const member = await this.memberRepo.findOne({ where: { id: dto.memberId, guildId } });
    if (!member) throw new NotFoundException('成员不存在');
    member.role = dto.role;
    return this.memberRepo.save(member);
  }

  async getGuildMembers(guildId: number) {
    return this.memberRepo.find({
      where: { guildId },
      order: { role: 'ASC', nickname: 'ASC' },
    });
  }

  // ===== 模块二：激活码验证与公会激活 =====

  /** 验证激活码 — 返回公会信息（分支A/B判断） */
  async getActivationInfo(code: string): Promise<{
    valid: boolean;
    alreadyActivated: boolean;
    guild?: any;
    message: string;
  }> {
    const guild = await this.guildRepo.findOne({ where: { activationCode: code } });
    if (!guild) {
      return { valid: false, alreadyActivated: false, message: '激活码不存在' };
    }

    if (guild.status === GuildStatus.ACTIVE) {
      // 分支B：公会已激活
      const owner = guild.ownerUserId
        ? await this.userRepo.findOne({ where: { id: guild.ownerUserId } })
        : null;
      return {
        valid: false,
        alreadyActivated: true,
        guild: {
          id: guild.id,
          name: guild.name,
          kookGuildId: guild.kookGuildId,
          ownerName: owner?.nickname || owner?.username || '-',
          createdAt: guild.createdAt,
        },
        message: '该公会已激活',
      };
    }

    // 分支A：可以激活
    return {
      valid: true,
      alreadyActivated: false,
      guild: {
        id: guild.id,
        name: guild.name,
        kookGuildId: guild.kookGuildId,
      },
      message: '激活码有效',
    };
  }

  /** 执行公会激活（原子性事务：创建用户+激活公会+绑定管理员） */
  async activateGuild(code: string, data: {
    username: string;
    password: string;
    nickname?: string;
    kookUserId?: string;
  }): Promise<any> {
    const guild = await this.guildRepo.findOne({ where: { activationCode: code } });
    if (!guild) throw new NotFoundException('激活码不存在');
    if (guild.status === GuildStatus.ACTIVE) throw new ConflictException('该公会已激活');

    // 检查用户名是否已存在
    const existingUser = await this.userRepo.findOne({ where: { username: data.username } });

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. 创建或获取用户
      let user: User;
      if (existingUser) {
        user = existingUser;
      } else {
        user = qr.manager.create(User, {
          username: data.username,
          passwordHash: await hashPassword(data.password),
          nickname: data.nickname || data.username,
          kookUserId: data.kookUserId || null,
          status: 1,
        });
        user = await qr.manager.save(user);
      }

      // 2. 激活公会
      guild.status = GuildStatus.ACTIVE;
      guild.ownerUserId = user.id;
      guild.name = guild.name.startsWith('待激活') ? `公会-${guild.kookGuildId.slice(-6)}` : guild.name;
      await qr.manager.save(guild);

      // 3. 建立超级管理员关联
      const existingMember = await qr.manager.findOne(GuildMember, {
        where: { guildId: guild.id, userId: user.id },
      });
      if (!existingMember) {
        const member = qr.manager.create(GuildMember, {
          guildId: guild.id,
          userId: user.id,
          kookUserId: data.kookUserId || guild.invitedByKookUserId || '',
          nickname: data.nickname || data.username,
          role: GuildRole.SUPER_ADMIN,
          status: 'active',
          joinedAt: new Date(),
          lastSyncedAt: new Date(),
          joinSource: 'invite_link',
        });
        await qr.manager.save(member);
      }

      await qr.commitTransaction();

      this.logger.log(`公会激活成功: ${guild.name} (ID: ${guild.id}), 管理员: ${user.username}`);
      return {
        guildId: guild.id,
        guildName: guild.name,
        userId: user.id,
        username: user.username,
        isNewUser: !existingUser,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  /** 安全的公会激活（基于已登录用户，无需传入密码） */
  async activateGuildForUser(code: string, userId: number, nickname?: string): Promise<any> {
    const guild = await this.guildRepo.findOne({ where: { activationCode: code } });
    if (!guild) throw new NotFoundException('激活码不存在');
    if (guild.status === GuildStatus.ACTIVE) throw new ConflictException('该公会已激活');

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1. 激活公会
      guild.status = GuildStatus.ACTIVE;
      guild.ownerUserId = user.id;
      guild.name = guild.name.startsWith('待激活') ? `公会-${guild.kookGuildId.slice(-6)}` : guild.name;
      await qr.manager.save(guild);

      // 2. 建立超级管理员关联
      const existingMember = await qr.manager.findOne(GuildMember, {
        where: { guildId: guild.id, userId: user.id },
      });
      if (!existingMember) {
        const member = qr.manager.create(GuildMember, {
          guildId: guild.id,
          userId: user.id,
          kookUserId: user.kookUserId || guild.invitedByKookUserId || '',
          nickname: nickname || user.nickname || user.username,
          role: GuildRole.SUPER_ADMIN,
          status: 'active',
          joinedAt: new Date(),
          lastSyncedAt: new Date(),
          joinSource: 'invite_link',
        });
        await qr.manager.save(member);
      }

      await qr.commitTransaction();

      this.logger.log(`公会激活成功: ${guild.name} (ID: ${guild.id}), 管理员: ${user.username}`);
      return {
        guildId: guild.id,
        guildName: guild.name,
        userId: user.id,
        username: user.username,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }
}

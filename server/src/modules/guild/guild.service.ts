import { Injectable, BadRequestException, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Guild } from './entities/guild.entity';
import { InviteCode } from './entities/invite-code.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { User } from '../user/entities/user.entity';
import { CreateGuildDto, UpdateGuildDto, GenerateInviteCodesDto, UpdateMemberRoleDto, UpdateInviteCodeStatusDto } from './dto/guild.dto';
import { GuildRole, InviteCodeStatus } from '../../common/constants/enums';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class GuildService {
  private readonly logger = new Logger(GuildService.name);

  constructor(
    @InjectRepository(Guild) private guildRepo: Repository<Guild>,
    @InjectRepository(InviteCode) private inviteRepo: Repository<InviteCode>,
    @InjectRepository(GuildMember) private memberRepo: Repository<GuildMember>,
    @InjectRepository(User) private userRepo: Repository<User>,
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
    // 1. 验证邀请码
    const validation = await this.validateInviteCode(dto.inviteCode);
    if (!validation.valid) throw new BadRequestException(validation.message);

    // 2. 检查公会名是否唯一
    const nameExists = await this.guildRepo.findOne({ where: { name: dto.name } });
    if (nameExists) throw new ConflictException('公会名称已被使用');

    // 3. 检查 KOOK 服务器 ID 是否已绑定
    const guildIdExists = await this.guildRepo.findOne({ where: { kookGuildId: dto.kookGuildId } });
    if (guildIdExists) throw new ConflictException('该 KOOK 服务器已绑定其他公会');

    // 4. 创建公会
    const guild = this.guildRepo.create({
      name: dto.name,
      iconUrl: dto.iconUrl || null,
      kookGuildId: dto.kookGuildId,
      ownerUserId: userId,
    });
    const saved = await this.guildRepo.save(guild);

    // 5. 标记邀请码为已使用，绑定公会
    const invite = await this.inviteRepo.findOne({ where: { code: dto.inviteCode } });
    invite.status = InviteCodeStatus.USED;
    invite.usedByUserId = userId;
    invite.usedAt = new Date();
    invite.boundGuildId = saved.id;
    invite.boundGuildName = saved.name;
    await this.inviteRepo.save(invite);

    // 6. 更新公会的 inviteCodeId
    saved.inviteCodeId = invite.id;
    await this.guildRepo.save(saved);

    // 7. 创建人绑定为超级管理员
    const member = this.memberRepo.create({
      guildId: saved.id,
      userId,
      kookUserId: '',
      nickname: '创建者',
      role: GuildRole.SUPER_ADMIN,
      status: 'active',
      joinedAt: new Date(),
      lastSyncedAt: new Date(),
    });
    await this.memberRepo.save(member);

    this.logger.log(`公会创建成功: ${saved.name} (ID: ${saved.id}), 邀请码: ${dto.inviteCode}`);
    return saved;
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
      where: { userId, status: 'active' },
      relations: ['guild'],
    });
    return members.map((m) => ({
      guildId: m.guildId,
      guildName: m.guild?.name,
      guildIcon: m.guild?.iconUrl,
      role: m.role,
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
}

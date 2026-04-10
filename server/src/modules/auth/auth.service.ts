import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { comparePassword } from '../../common/utils/crypto.util';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(GuildMember) private guildMemberRepo: Repository<GuildMember>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) return null;
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) return null;
    if (user.status === 0) throw new UnauthorizedException('账号已被禁用');
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.username, dto.password);
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    await this.userRepo.update(user.id, { lastLoginAt: new Date() });

    // 获取用户所属公会列表及角色
    const guildMembers = await this.guildMemberRepo.find({
      where: { userId: user.id, status: 'active' },
      relations: ['guild'],
    });
    const guilds = guildMembers.map((gm) => ({
      guildId: gm.guildId,
      guildName: gm.guild?.name,
      guildIcon: gm.guild?.iconUrl,
      role: gm.role,
    }));

    const payload = { sub: user.id, username: user.username };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        kookUserId: user.kookUserId,
        globalRole: user.globalRole,
      },
      guilds,
    };
  }

  async refreshToken(refreshToken: string) {
    const payload = this.jwtService.verify(refreshToken, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
    });
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || user.status === 0) throw new UnauthorizedException('用户无效');

    const newPayload = { sub: user.id, username: user.username };
    return {
      accessToken: this.jwtService.sign(newPayload),
      refreshToken: this.jwtService.sign(newPayload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn') as any,
      }),
    };
  }

  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');

    const guildMembers = await this.guildMemberRepo.find({
      where: { userId: user.id, status: 'active' },
      relations: ['guild'],
    });
    const guilds = guildMembers.map((gm) => ({
      guildId: gm.guildId,
      guildName: gm.guild?.name,
      guildIcon: gm.guild?.iconUrl,
      role: gm.role,
    }));

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      kookUserId: user.kookUserId,
      globalRole: user.globalRole,
      guilds,
    };
  }
}

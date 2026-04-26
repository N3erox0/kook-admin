import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/entities/user.entity';
import { GuildMember } from '../member/entities/guild-member.entity';
import { comparePassword, hashPassword } from '../../common/utils/crypto.util';
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

    // 获取用户所属公会列表及角色（包含left成员）
    const guildMembers = await this.guildMemberRepo.find({
      where: { userId: user.id },
      relations: ['guild'],
    });
    const guilds = guildMembers
      .filter((gm) => gm.guild?.status === 1)
      .map((gm) => ({
        guildId: gm.guildId,
        guildName: gm.guild?.name,
        guildIcon: gm.guild?.iconUrl,
        role: gm.role,
        memberStatus: gm.status,
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
      where: { userId: user.id },
      relations: ['guild'],
    });
    const guilds = guildMembers
      .filter((gm) => gm.guild?.status === 1)
      .map((gm) => ({
        guildId: gm.guildId,
        guildName: gm.guild?.name,
        guildIcon: gm.guild?.iconUrl,
        role: gm.role,
        memberStatus: gm.status,
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

  /**
   * 获取 KOOK OAuth2 授权链接
   * @param inviteCode 邀请码（创建公会场景）
   * @param purpose 用途：'login'(纯登录, 回调/auth/kook-callback) | 'invite'(创建公会, 回调/join)
   */
  getKookOAuthUrl(inviteCode?: string, purpose: 'login' | 'invite' = 'login'): string {
    const clientId = this.configService.get<string>('kook.clientId');
    const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';
    // V2.9.3: 根据用途选择不同回调路径
    const callbackPath = (purpose === 'invite' || inviteCode) ? '/join' : '/auth/kook-callback';
    const redirectUri = encodeURIComponent(`${baseUrl}${callbackPath}`);
    let url = `https://www.kookapp.cn/app/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=get_user_info`;
    if (inviteCode) url += `&state=${inviteCode}`;
    return url;
  }

  /**
   * V2.9.3: 获取 KOOK BOT 邀请链接（邀请 BOT 加入用户的 KOOK 服务器）
   */
  getBotInviteUrl(): string {
    const clientId = this.configService.get<string>('kook.clientId');
    // KOOK BOT 邀请链接格式
    return `https://www.kookapp.cn/app/oauth2/authorize?id=${clientId}&permissions=1&bot_id=0&scope=bot`;
  }

  /** KOOK OAuth2 回调：用 code 换 access_token + 获取用户信息 → 创建/关联用户 → 签发JWT */
  async handleKookCallback(code: string, callbackPath: string = '/join'): Promise<{
    accessToken: string;
    refreshToken: string;
    user: any;
    guilds: any[];
    kookUser: { id: string; username: string; nickname: string; avatar: string };
  }> {
    const clientId = this.configService.get<string>('kook.clientId');
    const clientSecret = this.configService.get<string>('kook.clientSecret');
    const baseUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';
    const redirectUri = `${baseUrl}${callbackPath}`;

    // 1. 用 code 换 access_token（KOOK 文档要求 application/json）
    const tokenRes = await fetch('https://www.kookapp.cn/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) {
      throw new UnauthorizedException(`KOOK OAuth2 授权失败: ${JSON.stringify(tokenData)}`);
    }

    // 2. 用 access_token 获取用户信息
    const userRes = await fetch('https://www.kookapp.cn/api/v3/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as any;
    const kookUser = userData.data || userData;
    if (!kookUser?.id) {
      throw new UnauthorizedException('无法获取 KOOK 用户信息');
    }

    // 3. 查找或创建系统用户
    let user = await this.userRepo.findOne({ where: { kookUserId: kookUser.id } });
    if (!user) {
      // 自动创建用户（用 KOOK ID 作为用户名）
      user = this.userRepo.create({
        username: `kook_${kookUser.id}`,
        passwordHash: await hashPassword(`kook_${kookUser.id}_${Date.now()}`),
        nickname: kookUser.nickname || kookUser.username,
        avatar: kookUser.avatar || null,
        kookUserId: kookUser.id,
        status: 1,
      });
      user = await this.userRepo.save(user);
    } else {
      // 更新头像和昵称
      user.nickname = kookUser.nickname || user.nickname;
      user.avatar = kookUser.avatar || user.avatar;
      user.lastLoginAt = new Date();
      await this.userRepo.save(user);
    }

    // 4. 查询公会列表（包含left成员）
    const guildMembers = await this.guildMemberRepo.find({
      where: { userId: user.id },
      relations: ['guild'],
    });
    const guilds = guildMembers
      .filter((gm) => gm.guild?.status === 1)
      .map((gm) => ({
        guildId: gm.guildId,
        guildName: gm.guild?.name,
        guildIcon: gm.guild?.iconUrl,
        role: gm.role,
        memberStatus: gm.status,
      }));

    // 5. 签发 JWT
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
      kookUser: {
        id: kookUser.id,
        username: kookUser.username,
        nickname: kookUser.nickname || kookUser.username,
        avatar: kookUser.avatar || '',
      },
    };
  }
}

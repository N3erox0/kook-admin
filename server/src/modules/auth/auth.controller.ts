import { Controller, Post, Body, Get, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RefreshTokenDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('认证')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @ApiOperation({ summary: '刷新令牌' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async getProfile(@CurrentUser('userId') userId: number) {
    return this.authService.getProfile(userId);
  }

  @Get('kook/oauth-url')
  @ApiOperation({ summary: '获取 KOOK OAuth2 授权链接' })
  getKookOAuthUrl(
    @Query('invite_code') inviteCode?: string,
    @Query('purpose') purpose?: 'login' | 'invite',
  ) {
    return { url: this.authService.getKookOAuthUrl(inviteCode, purpose || 'login') };
  }

  @Post('kook/callback')
  @ApiOperation({ summary: 'KOOK OAuth2 回调（用 code 换 token + 用户信息）' })
  async handleKookCallback(@Body() body: { code: string; callbackPath?: string }) {
    return this.authService.handleKookCallback(body.code, body.callbackPath || '/join');
  }

  @Get('kook/bot-invite-url')
  @ApiOperation({ summary: '获取 KOOK BOT 邀请链接' })
  getBotInviteUrl() {
    return { url: this.authService.getBotInviteUrl() };
  }
}

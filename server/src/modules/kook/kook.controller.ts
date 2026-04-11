import { Controller, Post, Get, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { KookSyncService } from './kook-sync.service';
import { KookService } from './kook.service';
import { KookMessageService, KookWebhookPayload } from './kook-message.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';

@Controller('api/kook')
export class KookController {
  private readonly logger = new Logger(KookController.name);

  constructor(
    private readonly kookService: KookService,
    private readonly syncService: KookSyncService,
    private readonly messageService: KookMessageService,
    private readonly configService: ConfigService,
  ) {}

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  async syncMembers() {
    return { message: 'KOOK 同步需要指定公会，请通过公会管理页面操作' };
  }

  /** KOOK Webhook 回调端点（不加 JWT 认证） */
  @Post('webhook')
  async handleWebhook(@Body() payload: KookWebhookPayload) {
    // Challenge 验证优先处理（KOOK 配置回调 URL 时的验证请求）
    if (payload.d?.challenge) {
      this.logger.log(`[Webhook] Challenge 验证: ${payload.d.challenge}`);
      return { challenge: payload.d.challenge };
    }

    const configToken = this.configService.get<string>('kook.verifyToken');
    if (configToken && payload.d?.verify_token && payload.d.verify_token !== configToken) {
      this.logger.warn('Webhook verify_token 不匹配');
      return { code: 403, message: 'Invalid verify_token' };
    }
    return this.messageService.handleWebhookEvent(payload);
  }

  /** KOOK Callback URL（等同于 webhook，KOOK 开放平台配置用） */
  @Post('callback')
  async handleCallback(@Body() payload: KookWebhookPayload) {
    // Challenge 验证优先处理
    if (payload.d?.challenge) {
      this.logger.log(`[Callback] Challenge 验证: ${payload.d.challenge}`);
      return { challenge: payload.d.challenge };
    }

    const configToken = this.configService.get<string>('kook.verifyToken');
    if (configToken && payload.d?.verify_token && payload.d.verify_token !== configToken) {
      this.logger.warn('Callback verify_token 不匹配');
      return { code: 403, message: 'Invalid verify_token' };
    }
    return this.messageService.handleWebhookEvent(payload);
  }

  /** 获取服务器详情（调试用） */
  @Get('guild-info')
  @UseGuards(JwtAuthGuard)
  async getGuildInfo(@Query('guild_id') guildId?: string) {
    const info = await this.kookService.getGuildView(guildId);
    return { code: 0, data: info };
  }

  /** 获取频道列表（调试用，帮助用户找频道 ID） */
  @Get('channels')
  @UseGuards(JwtAuthGuard)
  async getChannels(@Query('guild_id') guildId?: string) {
    const channels = await this.kookService.getChannelList(guildId);
    return { code: 0, data: channels };
  }

  /** 获取角色列表（调试用，帮助用户找角色 ID） */
  @Get('roles')
  @UseGuards(JwtAuthGuard)
  async getRoles(@Query('guild_id') guildId?: string) {
    const roles = await this.kookService.getGuildRoleList(guildId);
    return { code: 0, data: roles };
  }

  /** 给消息添加表情回应 */
  @Post('reaction')
  @UseGuards(JwtAuthGuard)
  async addReaction(@Body() body: { msg_id: string; emoji: string }) {
    await this.kookService.addReaction(body.msg_id, body.emoji);
    return { code: 0, message: '表情回应已添加' };
  }

  /** 发送频道消息（支持引用回复） */
  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() body: { channel_id: string; content: string; quote?: string; type?: number }) {
    const msgId = await this.kookService.sendChannelMessage(
      body.content, body.channel_id, { type: body.type, quote: body.quote },
    );
    return { code: 0, data: { msg_id: msgId } };
  }
}

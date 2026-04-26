import { Controller, Post, Get, Body, Query, Req, Res, UseGuards, Logger, ForbiddenException, Param, ParseIntPipe } from '@nestjs/common';
import { Request, Response } from 'express';
import { KookSyncService } from './kook-sync.service';
import { KookService } from './kook.service';
import { KookMessageService, KookWebhookPayload } from './kook-message.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import * as zlib from 'zlib';

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

  /**
   * 解析 KOOK 推送的数据（支持 zlib 压缩 + JSON 明文）
   * KOOK 默认使用 zlib deflate 压缩，除非 URL 带 ?compress=0
   */
  private async parseKookPayload(req: Request): Promise<KookWebhookPayload> {
    const body = req.body;

    // 情况1: NestJS bodyParser 已经解析为 JSON 对象（compress=0 或明文JSON）
    if (body && typeof body === 'object' && body.s !== undefined) {
      return body as KookWebhookPayload;
    }

    // 情况2: body 是 Buffer（zlib 压缩数据）
    if (Buffer.isBuffer(body)) {
      try {
        const decompressed = zlib.inflateSync(body);
        return JSON.parse(decompressed.toString('utf-8'));
      } catch {
        // 如果 inflate 失败，尝试直接解析为 JSON
        try {
          return JSON.parse(body.toString('utf-8'));
        } catch {
          throw new Error('无法解析 KOOK 推送数据');
        }
      }
    }

    // 情况3: body 是字符串
    if (typeof body === 'string') {
      // 尝试先当 base64 编码的压缩数据
      try {
        const buf = Buffer.from(body, 'base64');
        const decompressed = zlib.inflateSync(buf);
        return JSON.parse(decompressed.toString('utf-8'));
      } catch {
        // 直接当 JSON 字符串
        return JSON.parse(body);
      }
    }

    throw new Error('未知的 KOOK 推送数据格式');
  }

  /** 处理 KOOK 事件的核心逻辑 */
  private async processKookEvent(payload: KookWebhookPayload): Promise<any> {
    // Challenge 验证优先处理
    if (payload.d?.challenge) {
      this.logger.log(`Challenge 验证请求: ${payload.d.challenge}`);
      return { challenge: payload.d.challenge };
    }

    // verify_token 校验 — 配置了 token 时必须匹配
    const configToken = this.configService.get<string>('kook.verifyToken');
    if (configToken) {
      if (!payload.d?.verify_token || payload.d.verify_token !== configToken) {
        this.logger.warn('verify_token 缺失或不匹配');
        return { code: 403, message: 'Invalid verify_token' };
      }
    }

    return this.messageService.handleWebhookEvent(payload);
  }

  /** KOOK Webhook 回调端点（不加 JWT 认证） */
  @Post('callback')
  async handleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      this.logger.log(`[Callback] 收到请求, body type=${typeof req.body}, isBuffer=${Buffer.isBuffer(req.body)}, length=${req.body?.length || JSON.stringify(req.body || '').length}`);
      const payload = await this.parseKookPayload(req);
      this.logger.log(`[Callback] 解析成功: s=${payload.s}, type=${payload.d?.type}, channel_type=${payload.d?.channel_type}, extra_type=${payload.d?.extra?.type}, guild_id=${payload.d?.extra?.guild_id}, author=${payload.d?.author_id}`);
      const result = await this.processKookEvent(payload);
      this.logger.log(`[Callback] 处理结果: ${JSON.stringify(result).slice(0, 200)}`);
      res.status(200).json(result);
    } catch (err) {
      this.logger.error(`[Callback] 处理失败: ${err.message}`, err.stack);
      res.status(200).json({ code: 500, message: err.message });
    }
  }

  /** 获取 Bot 已加入的服务器列表（创建公会时下拉选择用） */
  @Get('bot-guilds')
  @UseGuards(JwtAuthGuard)
  async getBotGuilds() {
    return this.kookService.getBotGuildList();
  }

  /** 获取服务器详情 */
  @Get('guild-info')
  @UseGuards(JwtAuthGuard)
  async getGuildInfo(@Query('guild_id') guildId?: string) {
    return this.kookService.getGuildView(guildId);
  }

  /** 获取频道列表（优先使用公会独立Token） */
  @Get('channels')
  @UseGuards(JwtAuthGuard)
  async getChannels(@Query('guild_id') guildId?: string) {
    try {
      if (guildId) {
        const guild = await this.syncService.findGuildByKookId(guildId);
        if (guild?.kookBotToken) {
          return this.kookService.getChannelList(guildId, guild.kookBotToken);
        }
      }
      return this.kookService.getChannelList(guildId);
    } catch (err: any) {
      this.logger.warn(`获取频道列表失败: ${err.message}`);
      return { data: [], error: err.message || '获取频道列表失败，请检查 Bot Token 是否有效' };
    }
  }

  /** 验证用户在KOOK服务器是否为管理员 */
  @Post('verify-admin')
  @UseGuards(JwtAuthGuard)
  async verifyAdmin(@Body() body: { kookUserId: string; guildId: string }) {
    try {
      const userView = await this.kookService.getUserView(body.kookUserId, body.guildId);
      // KOOK 用户角色列表，检查是否包含管理权限
      // role_id=0 为默认角色（@全体成员），如果用户有其他角色可能是管理员
      const roles = userView?.roles || [];
      const guildView = await this.kookService.getGuildView(body.guildId);
      // 检查是否为服务器主（master_id）
      const isMaster = guildView?.user_id === body.kookUserId || (guildView as any)?.master_id === body.kookUserId;
      // 检查是否有除默认角色外的其他角色（通常管理员会分配角色）
      const hasAdminRole = roles.length > 1 || roles.some((r: number) => r !== 0);
      return { isAdmin: isMaster || hasAdminRole, isMaster, roles };
    } catch (err: any) {
      return { isAdmin: false, error: err.message };
    }
  }

  /** 获取角色列表 */
  @Get('roles')
  @UseGuards(JwtAuthGuard)
  async getRoles(@Query('guild_id') guildId?: string) {
    return this.kookService.getGuildRoleList(guildId);
  }

  /** 给消息添加表情回应（仅管理员） */
  @Post('reaction')
  @UseGuards(JwtAuthGuard)
  async addReaction(@Body() body: { msg_id: string; emoji: string }, @CurrentUser() user: any) {
    this.ensureAdmin(user);
    await this.kookService.addReaction(body.msg_id, body.emoji);
    return { message: '表情回应已添加' };
  }

  /** 发送频道消息（仅管理员） */
  @Post('send-message')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() body: { channel_id: string; content: string; quote?: string; type?: number }, @CurrentUser() user: any) {
    this.ensureAdmin(user);
    const msgId = await this.kookService.sendChannelMessage(
      body.content, body.channel_id, { type: body.type, quote: body.quote },
    );
    return { msg_id: msgId };
  }

  /** 内部方法：校验是否为 SSVIP 或具有管理权限 */
  private ensureAdmin(user: any) {
    if (!user?.globalRole || user.globalRole !== 'ssvip') {
      throw new ForbiddenException('仅管理员可执行此操作');
    }
  }

  /** F-100: 刷新单个公会的图标+名称（从KOOK拉取回填） */
  @Post('guild/:guildId/refresh-info')
  @UseGuards(JwtAuthGuard)
  async refreshGuildInfo(@Param('guildId', ParseIntPipe) guildId: number) {
    try {
      return await this.syncService.refreshGuildInfoById(guildId);
    } catch (err: any) {
      return { error: err.message || '刷新公会信息失败' };
    }
  }

  /**
   * V2.9.5: 主动拉取监听频道历史消息并处理（Webhook备用方案）
   * 遍历公会的所有监听频道，拉取最近N条消息，按现有逻辑处理（含去重）
   */
  @Post('guild/:guildId/pull-history')
  @UseGuards(JwtAuthGuard)
  async pullHistory(
    @Param('guildId', ParseIntPipe) guildId: number,
    @Body() body: { pageSize?: number },
  ) {
    try {
      return await this.messageService.pullHistoryMessages(guildId, body?.pageSize || 20);
    } catch (err: any) {
      return { error: err.message || '拉取历史消息失败' };
    }
  }
}

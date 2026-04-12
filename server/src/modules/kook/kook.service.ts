import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KookApiResponse,
  KookMember,
  KookGuildUserListData,
  KookGuildView,
  KookRole,
  KookRoleListData,
  KookMessage,
  KookMessageListData,
  KookMessageCreateResult,
  KookChannel,
  KookUserView,
} from './interfaces/kook-api.interface';

@Injectable()
export class KookService {
  private readonly logger = new Logger(KookService.name);
  private readonly baseUrl = 'https://www.kookapp.cn/api/v3';

  constructor(private configService: ConfigService) {}

  private get botToken(): string {
    return this.configService.get<string>('kook.botToken');
  }

  private get guildId(): string {
    return this.configService.get<string>('kook.guildId');
  }

  private get channelId(): string {
    return this.configService.get<string>('kook.channelId');
  }

  // ==================== 底层请求 ====================

  private async request<T>(method: string, endpoint: string, body?: any, token?: string): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Authorization: `Bot ${token || this.botToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
      const text = await response.text();
      this.logger.error(`KOOK API error: ${response.status} ${text}`);
      throw new Error(`KOOK API request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  /** 支持传入公会独立 Token 的请求 */
  async requestWithToken<T>(method: string, endpoint: string, botToken: string, body?: any): Promise<T> {
    return this.request<T>(method, endpoint, body, botToken);
  }

  // ==================== 服务器信息 ====================

  /** 获取 Bot 已加入的服务器列表 */
  async getBotGuildList(token?: string): Promise<{ id: string; name: string; icon: string }[]> {
    const allGuilds: { id: string; name: string; icon: string }[] = [];
    let page = 1;

    while (true) {
      const result = await this.request<KookApiResponse<{ items: any[]; meta: { page: number; page_total: number } }>>(
        'GET', `/guild/list?page=${page}&page_size=50`, undefined, token,
      );
      if (result.code !== 0) {
        this.logger.error(`获取Bot服务器列表失败: ${result.message}`);
        break;
      }
      for (const g of result.data.items) {
        allGuilds.push({ id: g.id, name: g.name, icon: g.icon || '' });
      }
      if (page >= result.data.meta.page_total) break;
      page++;
    }

    this.logger.log(`Bot 已加入 ${allGuilds.length} 个服务器`);
    return allGuilds;
  }

  /** 获取服务器详情（名称、图标、角色、频道列表） */
  async getGuildView(guildId?: string, token?: string): Promise<KookGuildView> {
    const targetGuild = guildId || this.guildId;
    const result = await this.request<KookApiResponse<KookGuildView>>(
      'GET', `/guild/view?guild_id=${targetGuild}`, undefined, token,
    );
    if (result.code !== 0) {
      throw new Error(`获取服务器详情失败: ${result.message}`);
    }
    return result.data;
  }

  /** 获取服务器角色列表 */
  async getGuildRoleList(guildId?: string, token?: string): Promise<KookRole[]> {
    const targetGuild = guildId || this.guildId;
    const allRoles: KookRole[] = [];
    let page = 1;

    while (true) {
      const result = await this.request<KookApiResponse<KookRoleListData>>(
        'GET', `/guild-role/list?guild_id=${targetGuild}&page=${page}&page_size=50`, undefined, token,
      );
      if (result.code !== 0) break;
      allRoles.push(...result.data.items);
      if (page >= result.data.meta.page_total) break;
      page++;
    }
    return allRoles;
  }

  /** 获取频道列表 */
  async getChannelList(guildId?: string, token?: string): Promise<KookChannel[]> {
    const targetGuild = guildId || this.guildId;
    const result = await this.request<KookApiResponse<{ items: KookChannel[] }>>(
      'GET', `/channel/list?guild_id=${targetGuild}`, undefined, token,
    );
    if (result.code !== 0) {
      throw new Error(`获取频道列表失败: ${result.message}`);
    }
    return result.data.items;
  }

  // ==================== 成员管理 ====================

  /** 获取服务器用户列表（自动翻页） */
  async getGuildMemberList(guildId?: string, token?: string): Promise<KookMember[]> {
    const targetGuild = guildId || this.guildId;
    const allMembers: KookMember[] = [];
    let page = 1;

    while (true) {
      const result = await this.request<KookApiResponse<KookGuildUserListData>>(
        'GET', `/guild/user-list?guild_id=${targetGuild}&page=${page}&page_size=50`, undefined, token,
      );
      if (result.code !== 0) {
        this.logger.error(`获取成员列表失败: ${result.message}`);
        break;
      }
      allMembers.push(...result.data.items);
      if (page >= result.data.meta.page_total) break;
      page++;
    }

    this.logger.log(`从 KOOK 获取到 ${allMembers.length} 个成员`);
    return allMembers;
  }

  /** 按角色ID筛选用户列表 */
  async getGuildMembersByRole(roleId: number, guildId?: string, token?: string): Promise<KookMember[]> {
    const targetGuild = guildId || this.guildId;
    const allMembers: KookMember[] = [];
    let page = 1;

    while (true) {
      const result = await this.request<KookApiResponse<KookGuildUserListData>>(
        'GET', `/guild/user-list?guild_id=${targetGuild}&role_id=${roleId}&page=${page}&page_size=50`, undefined, token,
      );
      if (result.code !== 0) break;
      allMembers.push(...result.data.items);
      if (page >= result.data.meta.page_total) break;
      page++;
    }
    return allMembers;
  }

  /** 获取单个用户详情（含 joined_at） */
  async getUserView(userId: string, guildId?: string, token?: string): Promise<KookUserView> {
    const targetGuild = guildId || this.guildId;
    const result = await this.request<KookApiResponse<KookUserView>>(
      'GET', `/user/view?user_id=${userId}&guild_id=${targetGuild}`, undefined, token,
    );
    if (result.code !== 0) {
      throw new Error(`获取用户详情失败: ${result.message}`);
    }
    return result.data;
  }

  // ==================== 频道消息 ====================

  /** 获取频道消息列表（增量拉取） */
  async getChannelMessages(
    channelId: string,
    msgId?: string,
    flag: 'before' | 'around' | 'after' = 'after',
    pageSize = 50,
    token?: string,
  ): Promise<KookMessage[]> {
    let endpoint = `/message/list?target_id=${channelId}&page_size=${pageSize}`;
    if (msgId) {
      endpoint += `&msg_id=${msgId}&flag=${flag}`;
    }
    const result = await this.request<KookApiResponse<KookMessageListData>>(
      'GET', endpoint, undefined, token,
    );
    if (result.code !== 0) {
      this.logger.error(`获取消息列表失败: ${result.message}`);
      return [];
    }
    return result.data.items || [];
  }

  /** 发送频道消息（支持文本/KMarkdown/卡片，支持引用回复） */
  async sendChannelMessage(
    content: string,
    channelId?: string,
    options?: { type?: number; quote?: string; tempTargetId?: string },
    token?: string,
  ): Promise<string | null> {
    const targetChannel = channelId || this.channelId;
    if (!targetChannel) {
      this.logger.warn('未配置 KOOK 频道 ID，跳过消息推送');
      return null;
    }

    const body: any = {
      type: options?.type || 1,
      target_id: targetChannel,
      content,
    };
    if (options?.quote) body.quote = options.quote;
    if (options?.tempTargetId) body.temp_target_id = options.tempTargetId;

    const result = await this.request<KookApiResponse<KookMessageCreateResult>>(
      'POST', '/message/create', body, token,
    );

    if (result.code !== 0) {
      this.logger.error(`发送消息失败: ${result.message}`);
      return null;
    }
    this.logger.log('KOOK 消息发送成功');
    return result.data?.msg_id || null;
  }

  /** 发送 KMarkdown 消息（type=9，支持 @角色/@用户 语法） */
  async sendKMarkdownMessage(
    content: string,
    channelId?: string,
    options?: { quote?: string; tempTargetId?: string },
    token?: string,
  ): Promise<string | null> {
    return this.sendChannelMessage(content, channelId, { ...options, type: 9 }, token);
  }

  /** 给特定角色推送消息（在频道中 @角色） */
  async sendMessageToRole(
    roleId: string | number,
    content: string,
    channelId?: string,
    token?: string,
  ): Promise<string | null> {
    const kmdContent = `(rol)${roleId}(rol) ${content}`;
    return this.sendKMarkdownMessage(kmdContent, channelId, undefined, token);
  }

  // ==================== 表情回应 ====================

  /** 给消息添加表情回应 */
  async addReaction(msgId: string, emoji: string, token?: string): Promise<void> {
    const result = await this.request<KookApiResponse>(
      'POST', '/message/add-reaction', { msg_id: msgId, emoji }, token,
    );
    if (result.code !== 0) {
      this.logger.error(`添加表情回应失败: ${result.message}`);
    }
  }

  /** 删除消息的表情回应 */
  async deleteReaction(msgId: string, emoji: string, userId?: string, token?: string): Promise<void> {
    const body: any = { msg_id: msgId, emoji };
    if (userId) body.user_id = userId;
    const result = await this.request<KookApiResponse>(
      'POST', '/message/delete-reaction', body, token,
    );
    if (result.code !== 0) {
      this.logger.error(`删除表情回应失败: ${result.message}`);
    }
  }

  // ==================== 私信 ====================

  /** 创建私聊会话，返回 chat_code */
  async createUserChat(targetId: string, token?: string): Promise<string> {
    const result = await this.request<KookApiResponse<{ code: string }>>(
      'POST', '/user-chat/create', { target_id: targetId }, token,
    );
    if (result.code !== 0) {
      throw new Error(`创建私聊会话失败: ${result.message}`);
    }
    return result.data.code;
  }

  /** 发送私信给用户 */
  async sendDirectMessage(targetId: string, content: string, type = 1, token?: string): Promise<void> {
    try {
      const chatCode = await this.createUserChat(targetId, token);
      const result = await this.request<KookApiResponse>(
        'POST', '/direct-message/create', { type, target_id: chatCode, content }, token,
      );
      if (result.code !== 0) {
        this.logger.error(`发送私信失败: ${result.message}`);
      } else {
        this.logger.log(`KOOK 私信发送成功 -> ${targetId}`);
      }
    } catch (err) {
      this.logger.error(`发送私信异常: ${err}`);
    }
  }

  /** 给特定角色所有用户发送私信 */
  async sendDirectMessageToRole(
    roleId: number,
    content: string,
    guildId?: string,
    token?: string,
  ): Promise<{ sent: number; failed: number }> {
    const members = await this.getGuildMembersByRole(roleId, guildId, token);
    let sent = 0, failed = 0;

    for (const member of members) {
      if (member.bot) continue;
      try {
        await this.sendDirectMessage(member.id, content, 1, token);
        sent++;
        // 避免频率限制
        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch {
        failed++;
      }
    }

    this.logger.log(`角色 ${roleId} 私信推送完成: 成功 ${sent}, 失败 ${failed}`);
    return { sent, failed };
  }
}

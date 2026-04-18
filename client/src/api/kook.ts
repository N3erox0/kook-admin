import request from './request';

/** 获取 KOOK 频道列表 */
export const getKookChannels = (guildKookId?: string) =>
  request.get('/kook/channels', { params: { guild_id: guildKookId } });

/** 获取 KOOK 角色列表 */
export const getKookRoles = (guildKookId?: string) =>
  request.get('/kook/roles', { params: { guild_id: guildKookId } });

/** 获取 Bot 已加入的服务器列表 */
export const getBotGuilds = () => request.get('/kook/bot-guilds');

/** F-100: 刷新公会图标（从KOOK同步回填 icon_url） */
export const refreshGuildInfo = (guildId: number) =>
  request.post(`/kook/guild/${guildId}/refresh-info`);

/** 验证 KOOK 用户是否为服务器管理员 */
export const verifyKookAdmin = (data: { kookUserId: string; guildId: string }) =>
  request.post('/kook/verify-admin', data);

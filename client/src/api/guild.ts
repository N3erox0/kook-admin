import request from './request';

export const validateInviteCode = (code: string) =>
  request.post('/guilds/invite-codes/validate', { code });

export const createGuild = (data: { inviteCode: string; name: string; iconUrl?: string; kookGuildId: string }) =>
  request.post('/guilds', data);

export const getMyGuilds = () => request.get('/guilds/my');

export const getAllGuilds = () => request.get('/guilds/all');

export const getGuild = (id: number) => request.get(`/guilds/${id}`);

export const updateGuild = (id: number, data: any) => request.put(`/guilds/${id}`, data);

export const getGuildMembers = (guildId: number) => request.get(`/guilds/${guildId}/members`);

export const updateMemberRole = (guildId: number, memberId: number, role: string) =>
  request.put(`/guilds/${guildId}/members/role`, { memberId, role });

// ===== 邀请码 =====
export const generateInviteCodes = (data: { count: number; prefix?: string; remark?: string }) =>
  request.post('/guilds/invite-codes/generate', data);

export const getAllInviteCodes = () => request.get('/guilds/invite-codes');

export const getInviteCodeById = (id: number) => request.get(`/guilds/invite-codes/${id}`);

export const updateInviteCodeStatus = (id: number, status: string) =>
  request.put(`/guilds/invite-codes/${id}/status`, { status });

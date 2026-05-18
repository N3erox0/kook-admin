import request from './request';

export const getBattleReports = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/battle-reports`, { params });

export const pullBattleReports = (guildId: number) =>
  request.post(`/guild/${guildId}/battle-reports/pull`);

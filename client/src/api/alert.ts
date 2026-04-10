import request from './request';

export const getAlertRules = (guildId: number) =>
  request.get(`/guild/${guildId}/alerts/rules`);

export const createAlertRule = (guildId: number, data: any) =>
  request.post(`/guild/${guildId}/alerts/rules`, data);

export const updateAlertRule = (guildId: number, id: number, data: any) =>
  request.put(`/guild/${guildId}/alerts/rules/${id}`, data);

export const deleteAlertRule = (guildId: number, id: number) =>
  request.delete(`/guild/${guildId}/alerts/rules/${id}`);

export const getAlertRecords = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/alerts/records`, { params });

export const resolveAlertRecord = (guildId: number, id: number) =>
  request.put(`/guild/${guildId}/alerts/records/${id}/resolve`);

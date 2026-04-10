import request from './request';

export const getResupplyList = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/resupply`, { params });

export const getResupplyDetail = (guildId: number, id: number) =>
  request.get(`/guild/${guildId}/resupply/${id}`);

export const createResupply = (guildId: number, data: any) =>
  request.post(`/guild/${guildId}/resupply`, data);

export const processResupply = (guildId: number, id: number, data: { action: string; remark?: string; dispatchQuantity?: number }) =>
  request.put(`/guild/${guildId}/resupply/${id}/process`, data);

export const updateResupplyFields = (guildId: number, id: number, data: any) =>
  request.put(`/guild/${guildId}/resupply/${id}/fields`, data);

export const batchProcessResupply = (guildId: number, data: { ids: number[]; action: string; remark?: string }) =>
  request.post(`/guild/${guildId}/resupply/batch-process`, data);

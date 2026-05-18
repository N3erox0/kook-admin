import request from './request';

export const getInventoryList = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/inventory`, { params });

export const getInventoryOverview = (guildId: number) =>
  request.get(`/guild/${guildId}/inventory/overview`);

export const upsertInventory = (guildId: number, data: any) =>
  request.post(`/guild/${guildId}/inventory`, data);

export const batchUpsertInventory = (guildId: number, items: any[]) =>
  request.post(`/guild/${guildId}/inventory/batch`, { items });

export const updateInventoryFields = (guildId: number, id: number, data: any) =>
  request.patch(`/guild/${guildId}/inventory/${id}`, data);

export const adjustInventoryQuantity = (guildId: number, id: number, delta: number) =>
  request.put(`/guild/${guildId}/inventory/${id}/adjust`, { delta });

export const deleteInventory = (guildId: number, id: number) =>
  request.delete(`/guild/${guildId}/inventory/${id}`);

export const getInventoryLogs = (guildId: number, inventoryId: number, params?: any) =>
  request.get(`/guild/${guildId}/inventory/${inventoryId}/logs`, { params });

export const getAllInventoryLogs = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/inventory/logs`, { params });

import request from './request';

export const createOcrBatch = (guildId: number, data: { imageUrl: string; imageType?: string }) =>
  request.post(`/guild/${guildId}/ocr/batch`, data);

export const getOcrBatches = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/ocr/batches`, { params });

export const getOcrBatchDetail = (guildId: number, batchId: number) =>
  request.get(`/guild/${guildId}/ocr/batch/${batchId}`);

export const confirmOcrItem = (guildId: number, itemId: number, data: any) =>
  request.put(`/guild/${guildId}/ocr/item/${itemId}/confirm`, data);

export const confirmAllOcrItems = (guildId: number, batchId: number) =>
  request.post(`/guild/${guildId}/ocr/batch/${batchId}/confirm-all`);

export const saveOcrToInventory = (guildId: number, batchId: number) =>
  request.post(`/guild/${guildId}/ocr/batch/${batchId}/save`);

export const getKookPending = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/ocr/kook-pending`, { params });

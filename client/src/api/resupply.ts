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

export const batchAssignRoom = (guildId: number, data: { ids: number[]; room: string }) =>
  request.post(`/guild/${guildId}/resupply/batch-assign-room`, data);

export const getGroupedResupply = (guildId: number, keyword?: string) =>
  request.get(`/guild/${guildId}/resupply/grouped`, { params: { keyword } });

export const getMergedResupply = (guildId: number, params?: any) =>
  request.get(`/guild/${guildId}/resupply/merged`, { params });

/** F-108: 快捷补装完成（待识别路径B） */
export const quickCompleteResupply = (
  guildId: number, id: number,
  data: { equipmentEntries?: { catalogId: number; quantity: number }[]; equipmentIds?: string; remark?: string; killDate?: string; mapName?: string; gameId?: string; resupplyBox?: string; kookNickname?: string },
) =>
  request.post(`/guild/${guildId}/resupply/${id}/quick-complete`, data);

/** F-108: 批量废弃（待识别路径A） */
export const batchRejectResupply = (guildId: number, data: { ids: number[]; remark?: string }) =>
  request.post(`/guild/${guildId}/resupply/batch-reject`, data);

/** V2.9.3: 补装申请图像识别预览（按 resupplyId） */
export const previewMatchResupply = (
  guildId: number, id: number,
  data?: { topN?: number; autoThreshold?: number; hammingThreshold?: number },
) =>
  request.post(`/guild/${guildId}/resupply/${id}/preview-match`, data || {});

/** V2.9.3: 补装申请图像识别预览（按图片 URL，供待识别Tab使用） */
export const previewMatchFromUrl = (
  guildId: number,
  data: { imageUrl: string; topN?: number; autoThreshold?: number; hammingThreshold?: number },
) =>
  request.post(`/guild/${guildId}/resupply/preview-from-url`, data);

/** V2.9.5: 主动拉取KOOK频道历史消息 */
export const pullKookHistory = (guildId: number, pageSize = 20, startDate?: string, endDate?: string) =>
  request.post(`/kook/guild/${guildId}/pull-history`, { pageSize, startDate, endDate });



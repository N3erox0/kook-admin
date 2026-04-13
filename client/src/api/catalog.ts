import request from './request';

export const getCatalogList = (params?: any) => request.get('/catalog', { params });

export const getCatalogById = (id: number) => request.get(`/catalog/${id}`);

export const searchCatalog = (keyword: string) => request.get('/catalog/search', { params: { keyword } });

export const createCatalog = (data: any) => request.post('/catalog', data);

export const updateCatalog = (id: number, data: any) => request.put(`/catalog/${id}`, data);

export const deleteCatalog = (id: number) => request.delete(`/catalog/${id}`);

export const csvImportCatalog = (items: any[]) => request.post('/catalog/csv-import', { items });

export const batchMatchCatalog = (items: any[]) => request.post('/catalog/match', { items });

export const importAlbionCatalog = (minTier = 4) => request.post('/catalog/import-albion', { minTier });

// 图片管理
export const getCatalogImages = (catalogId: number) => request.get(`/catalog/${catalogId}/images`);

export const addCatalogImage = (catalogId: number, data: any) => request.post(`/catalog/${catalogId}/images`, data);

export const deleteCatalogImage = (imageId: number) => request.delete(`/catalog/images/${imageId}`);

export const setPrimaryCatalogImage = (catalogId: number, imageId: number) =>
  request.put(`/catalog/${catalogId}/images/${imageId}/primary`);

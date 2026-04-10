import request from './request';

export const uploadFile = (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

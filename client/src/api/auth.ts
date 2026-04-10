import request from './request';

export const login = (data: { username: string; password: string }) =>
  request.post('/auth/login', data);

export const refreshToken = (refreshToken: string) =>
  request.post('/auth/refresh', { refreshToken });

export const getProfile = () => request.get('/auth/profile');

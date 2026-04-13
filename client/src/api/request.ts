import axios from 'axios';
import { message } from 'antd';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  failedQueue = [];
};

request.interceptors.request.use((config) => {
  const noAuthPaths = ['/auth/login', '/auth/refresh', '/guilds/invite-codes/validate', '/guilds/activate/info', '/guilds/activate', '/auth/kook/oauth-url', '/auth/kook/callback'];
  const isNoAuth = noAuthPaths.some(p => config.url?.includes(p));

  if (!isNoAuth) {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const guildId = localStorage.getItem('currentGuildId');
    if (guildId) {
      config.headers['X-Guild-Id'] = guildId;
    }
  }
  return config;
});

request.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) return res.data;
      message.error(res.message || '请求失败');
      return Promise.reject(res);
    }
    return res;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refreshToken');

      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return request(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res = await axios.post('/api/auth/refresh', { refreshToken });
          const data = res.data?.data || res.data;
          if (data?.accessToken) {
            localStorage.setItem('token', data.accessToken);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
            processQueue(null, data.accessToken);
            return request(originalRequest);
          }
        } catch {
          processQueue(error, null);
        } finally {
          isRefreshing = false;
        }
      }

      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    const errData = error.response?.data;
    const errMsg = errData?.message || error.message || '网络错误';
    message.error(errMsg);
    return Promise.reject(errData || { message: errMsg });
  },
);

export default request;

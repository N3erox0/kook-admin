import axios from 'axios';
import { message } from 'antd';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const guildId = localStorage.getItem('currentGuildId');
  if (guildId) {
    config.headers['X-Guild-Id'] = guildId;
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
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
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

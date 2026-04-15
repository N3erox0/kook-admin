import { create } from 'zustand';
import type { User } from '@/types';

// 同步从 localStorage 读取初始认证状态（避免刷新页面时 AuthRoute 误判为未登录）
const _initToken = localStorage.getItem('token');
const _initUserStr = localStorage.getItem('user');
let _initUser: User | null = null;
let _initAuth = false;
try {
  if (_initToken && _initUserStr && _initUserStr !== 'undefined' && _initUserStr !== 'null') {
    _initUser = JSON.parse(_initUserStr);
    _initAuth = true;
  }
} catch { /* ignore */ }

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User, refreshToken?: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: _initAuth ? _initToken : null,
  user: _initUser,
  isAuthenticated: _initAuth,

  setAuth: (token, user, refreshToken?) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('currentGuildId');
    localStorage.removeItem('currentGuildRole');
    set({ token: null, user: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      if (token && userStr && userStr !== 'undefined' && userStr !== 'null') {
        const user = JSON.parse(userStr);
        set({ token, user, isAuthenticated: true });
      }
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },
}));

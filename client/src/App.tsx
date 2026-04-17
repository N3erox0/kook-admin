import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { getProfile } from '@/api/auth';
import AppLayout from '@/components/Layout';
import AuthRoute from '@/components/AuthRoute';
import HomePage from '@/pages/home';
import LoginPage from '@/pages/login';
import JoinPage from '@/pages/join';
import SSVIPLoginPage from '@/pages/ssvip';
import GuildSelectPage from '@/pages/guild/GuildSelect';
import GuildCreatePage from '@/pages/guild/GuildCreate';
import DashboardPage from '@/pages/dashboard';
import MemberPage from '@/pages/member';
import CatalogPage from '@/pages/catalog';
import EquipmentPage from '@/pages/equipment';
import ResupplyPage from '@/pages/resupply';
import AlertPage from '@/pages/alert';
import LogPage from '@/pages/log';
import InviteCodePage from '@/pages/invite-codes';
import GuildSettingsPage from '@/pages/guild/GuildSettings';

function GuildRoute({ children }: { children: React.ReactNode }) {
  const { currentGuildId } = useGuildStore();
  const { user } = useAuthStore();
  if (!currentGuildId && user?.globalRole !== 'ssvip') {
    return <Navigate to="/guild/select" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { loadFromStorage, token } = useAuthStore();
  const { setGuilds } = useGuildStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (token) {
      getProfile().then((res: any) => {
        if (res?.guilds) setGuilds(res.guilds);
      }).catch(() => {});
    }
  }, [token]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <Routes>
            {/* 公开页面 */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/ssvip" element={<SSVIPLoginPage />} />

            {/* 需登录 */}
            <Route path="/guild/select" element={<AuthRoute><GuildSelectPage /></AuthRoute>} />
            <Route path="/guild/create" element={<AuthRoute><GuildCreatePage /></AuthRoute>} />

            {/* 管理后台 */}
            <Route path="/admin" element={<AuthRoute><GuildRoute><AppLayout /></GuildRoute></AuthRoute>}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="members" element={<MemberPage />} />
              <Route path="catalog" element={<CatalogPage />} />
              <Route path="equipment" element={<EquipmentPage />} />
              <Route path="resupply" element={<ResupplyPage />} />
              <Route path="kook-pending" element={<KookPendingPage />} />
              <Route path="alerts" element={<AlertPage />} />
              <Route path="invite-codes" element={<InviteCodePage />} />
              <Route path="logs" element={<LogPage />} />
              <Route path="settings" element={<GuildSettingsPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

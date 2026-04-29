import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout as AntLayout, Menu, Dropdown, Avatar, Typography, Space, Tag, message } from 'antd';
import {
  DashboardOutlined, TeamOutlined, DatabaseOutlined, AppstoreOutlined,
  SyncOutlined, AlertOutlined, FileTextOutlined, SwapOutlined,
  LogoutOutlined, UserOutlined, KeyOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  SettingOutlined, PlusOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { ROLE_LABELS } from '@/types';
import { refreshGuildInfo } from '@/api/kook';
import { getProfile } from '@/api/auth';
import type { MenuProps } from 'antd';

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

// SSVIP 仅可见：装备参考库、邀请码管理（控制台仅显示公会数）
// 超管：全部
// 库存管理员/补装管理员/普通用户：仅本公会数据
// F-107: 待识别工作区归并到补装管理页内Tab，移除独立菜单
const allMenuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '控制台', roles: ['super_admin', 'ssvip', 'inventory_admin', 'resupply_staff', 'normal'] },
  { key: '/admin/members', icon: <TeamOutlined />, label: '成员管理', roles: ['super_admin', 'inventory_admin', 'resupply_staff', 'normal'] },
  { key: '/admin/catalog', icon: <DatabaseOutlined />, label: '装备参考库', roles: ['ssvip'] },
  { key: '/admin/equipment', icon: <AppstoreOutlined />, label: '装备库存', roles: ['super_admin', 'inventory_admin', 'resupply_staff', 'normal'] },
  { key: '/admin/resupply', icon: <SyncOutlined />, label: '补装管理', roles: ['super_admin', 'resupply_staff'] },
  { key: '/admin/alerts', icon: <AlertOutlined />, label: '预警设置', roles: ['super_admin', 'inventory_admin'] },
  { key: '/admin/invite-codes', icon: <KeyOutlined />, label: '邀请码管理', roles: ['ssvip'] },
  { key: '/admin/logs', icon: <FileTextOutlined />, label: '操作日志', roles: ['super_admin', 'ssvip'] },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '公会设置', roles: ['super_admin'] },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { currentGuildId, currentGuildRole, guilds, setGuilds } = useGuildStore();
  const [collapsed, setCollapsed] = useState(false);
  const [refreshingIcon, setRefreshingIcon] = useState(false);

  const currentGuild = guilds.find((g) => g.guildId === currentGuildId);
  // SSVIP 用户始终使用 globalRole，不被公会角色覆盖
  const isSSVIP = user?.globalRole === 'ssvip';
  const effectiveRole = isSSVIP ? 'ssvip' : (currentGuildRole || user?.globalRole || '');

  // V2.9.9: 自动刷新公会图标（如果为空且非SSVIP）
  useEffect(() => {
    if (currentGuildId && !isSSVIP && currentGuild && !currentGuild.guildIcon) {
      handleRefreshIcon();
    }
  }, [currentGuildId]);
  const currentPath = location.pathname;
  const selectedKey = allMenuItems.find(m => currentPath === m.key)?.key
    || '/admin/' + location.pathname.split('/').slice(2).join('/');

  const visibleMenus = allMenuItems.filter((m) => effectiveRole && m.roles.includes(effectiveRole));
  const menuItems: MenuProps['items'] = visibleMenus.map((m) => ({
    key: m.key,
    icon: m.icon,
    label: m.label,
  }));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /** F-100: 刷新当前公会图标 */
  const handleRefreshIcon = async () => {
    if (!currentGuildId || isSSVIP) return;
    setRefreshingIcon(true);
    try {
      const res: any = await refreshGuildInfo(currentGuildId);
      if (res?.error) {
        message.warning(res.error);
      } else {
        // 重新拉取用户 profile 更新 guilds
        try {
          const profile: any = await getProfile();
          if (profile?.guilds) setGuilds(profile.guilds);
        } catch {}
        message.success('公会图标已刷新');
      }
    } catch (err: any) {
      message.error(err?.message || '刷新失败');
    } finally {
      setRefreshingIcon(false);
    }
  };

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'role',
      label: <Text type="secondary">{ROLE_LABELS[effectiveRole] || effectiveRole}</Text>,
      disabled: true,
    },
    { type: 'divider' },
    ...(!isSSVIP ? [{
      key: 'switch-guild',
      icon: <SwapOutlined />,
      label: '切换公会',
      onClick: () => navigate('/guild/select'),
    }, {
      key: 'add-guild',
      icon: <PlusOutlined />,
      label: '添加新公会',
      onClick: () => navigate('/guild/create'),
    }, {
      key: 'refresh-icon',
      icon: <ReloadOutlined spin={refreshingIcon} />,
      label: '刷新公会图标',
      onClick: handleRefreshIcon,
      disabled: refreshingIcon,
    }] : []),
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
        trigger={null}
        style={{ boxShadow: '2px 0 8px rgba(0,0,0,0.1)' }}
      >
        <div style={{
          height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '0 16px',
        }}>
          {!isSSVIP && currentGuild?.guildIcon ? (
            <Avatar src={currentGuild.guildIcon} size={32} shape="square" />
          ) : (
            <Avatar icon={<AppstoreOutlined />} size={32} shape="square"
              style={{ background: isSSVIP ? '#faad14' : '#1890ff' }} />
          )}
          {!collapsed && (
            <Text strong style={{ color: '#fff', marginLeft: 12, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isSSVIP ? 'SSVIP 管理中心' : (currentGuild?.guildName || '22BN公会助手')}
            </Text>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <AntLayout>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', height: 56,
        }}>
          <div style={{ cursor: 'pointer' }} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <MenuUnfoldOutlined style={{ fontSize: 18 }} /> : <MenuFoldOutlined style={{ fontSize: 18 }} />}
          </div>

          <Space size={16}>
            {isSSVIP && <Tag color="gold">SSVIP</Tag>}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />}
                  style={{ background: isSSVIP ? '#faad14' : '#1890ff' }}>
                  {user?.nickname?.[0]}
                </Avatar>
                <Text>{user?.nickname || user?.username}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: 24, minHeight: 280 }}>
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}

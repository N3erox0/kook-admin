import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Tabs } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined, KeyOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { login as loginApi } from '@/api/auth';
import request from '@/api/request';

const { Title, Text } = Typography;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { setGuilds, selectGuild } = useGuildStore();
  const [loading, setLoading] = useState(false);
  const [inviteLoading, setInviteLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await loginApi(values);
      setAuth(res.accessToken, res.user);
      if (res.guilds && res.guilds.length > 0) {
        setGuilds(res.guilds);
        selectGuild(res.guilds[0].guildId);
      }
      message.success('登录成功');
      if (res.user?.globalRole === 'ssvip') {
        navigate('/admin/dashboard');
      } else if (res.guilds && res.guilds.length > 0) {
        navigate('/admin/dashboard');
      } else {
        navigate('/guild/select');
      }
    } catch {} finally { setLoading(false); }
  };

  const handleInviteLogin = async (values: { inviteCode: string }) => {
    setInviteLoading(true);
    try {
      const res: any = await request.post('/api/guilds/invite-codes/validate', { code: values.inviteCode });
      if (res.valid) {
        message.success('邀请码验证通过，请先登录或注册');
        navigate('/join');
      } else {
        message.error(res.message || '邀请码无效');
      }
    } catch {} finally { setInviteLoading(false); }
  };

  const tabItems = [
    {
      key: 'account',
      label: '账号登录',
      children: (
        <Form onFinish={handleLogin} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{ height: 44, borderRadius: 8, fontWeight: 500 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'invite',
      label: '邀请码登录',
      children: (
        <Form onFinish={handleInviteLogin} size="large" autoComplete="off">
          <Form.Item name="inviteCode" rules={[{ required: true, message: '请输入邀请码' }]}>
            <Input prefix={<KeyOutlined />} placeholder="请输入邀请码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={inviteLoading} block
              style={{ height: 44, borderRadius: 8, fontWeight: 500 }}>
              验证邀请码
            </Button>
          </Form.Item>
          <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
            输入邀请码验证后进入公会创建流程
          </Text>
        </Form>
      ),
    },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 50%, #0050b3 100%)',
    }}>
      <Card
        style={{ width: 420, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #1890ff, #0050b3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 4px 12px rgba(24,144,255,0.4)',
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>22BN公会助手</Title>
          <Text type="secondary">KOOK Guild Assistant</Text>
        </div>

        <Tabs items={tabItems} centered />
      </Card>
    </div>
  );
}

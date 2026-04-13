import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, CrownOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { login as loginApi } from '@/api/auth';

const { Title, Text } = Typography;

export default function SSVIPLoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { setGuilds } = useGuildStore();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await loginApi(values);
      if (res.user?.globalRole !== 'ssvip') {
        message.error('该入口仅限 SSVIP 管理员登录');
        setLoading(false);
        return;
      }
      setAuth(res.accessToken, res.user, res.refreshToken);
      if (res.guilds) setGuilds(res.guilds);
      message.success('SSVIP 登录成功');
      navigate('/admin/dashboard');
    } catch {} finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    }}>
      <Card
        style={{ width: 400, borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', border: '1px solid rgba(250,173,20,0.2)' }}
        bordered={false}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #faad14, #d48806)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 6px 20px rgba(250,173,20,0.4)',
          }}>
            <CrownOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>SSVIP</Title>
          <Text type="secondary">22BN公会助手</Text>
        </div>

        <Form onFinish={handleLogin} size="large" autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入管理员账号' }]}>
            <Input prefix={<UserOutlined />} placeholder="管理员账号" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block
              style={{
                height: 48, borderRadius: 8, fontWeight: 600, fontSize: 16,
                background: 'linear-gradient(135deg, #faad14, #d48806)',
                borderColor: '#d48806',
              }}>
              登 录
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Button type="link" style={{ color: '#999' }} onClick={() => navigate('/')}>
            返回首页
          </Button>
        </div>
      </Card>
    </div>
  );
}

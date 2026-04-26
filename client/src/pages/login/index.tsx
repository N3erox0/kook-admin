import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Form, Input, Button, Card, Typography, message, Divider } from 'antd';
import { UserOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
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
  const [kookLoading, setKookLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await loginApi(values);
      setAuth(res.accessToken, res.user, res.refreshToken);
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
    } catch (err: any) {
      message.error(err?.message || '登录失败，请检查用户名和密码');
    } finally { setLoading(false); }
  };

  const handleKookLogin = async () => {
    setKookLoading(true);
    try {
      const res: any = await request.get('/auth/kook/oauth-url', { params: { purpose: 'login' } });
      if (res?.url) {
        const popup = window.open(res.url, '_blank', 'width=600,height=700');
        if (!popup) {
          message.warning('浏览器拦截了弹窗，请允许弹窗后重试');
          setKookLoading(false);
          return;
        }
        const handler = (event: MessageEvent) => {
          if (event.data?.type === 'kook-oauth-success') {
            window.removeEventListener('message', handler);
            const data = event.data.data;
            setAuth(data.accessToken, data.user, data.refreshToken);
            if (data.guilds) {
              setGuilds(data.guilds);
              if (data.guilds.length > 0) selectGuild(data.guilds[0].guildId);
            }
            message.success('KOOK 登录成功');
            setKookLoading(false);
            if (data.user?.globalRole === 'ssvip') {
              navigate('/admin/dashboard');
            } else if (data.guilds?.length > 0) {
              navigate('/admin/dashboard');
            } else {
              navigate('/guild/select');
            }
          }
        };
        window.addEventListener('message', handler);
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', handler);
            setKookLoading(false);
          }
        }, 1000);
      } else {
        message.error('获取 KOOK 授权链接失败');
        setKookLoading(false);
      }
    } catch {
      message.error('获取 KOOK 授权链接失败');
      setKookLoading(false);
    }
  };

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
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #1890ff, #0050b3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 4px 12px rgba(24,144,255,0.4)',
          }}>
            <SafetyCertificateOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>22BN公会助手</Title>
          <Text type="secondary">公会管理员登录</Text>
        </div>

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

        <Divider plain style={{ margin: '8px 0 16px' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>或</Text>
        </Divider>

        <Button
          block
          size="large"
          loading={kookLoading}
          onClick={handleKookLogin}
          style={{
            height: 44, borderRadius: 8, fontWeight: 500,
            background: '#6b48ff', borderColor: '#6b48ff', color: '#fff',
          }}
        >
          使用 KOOK 账号登录
        </Button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button type="link" style={{ color: '#999' }} onClick={() => navigate('/')}>返回首页</Button>
        </div>

        <Divider plain style={{ margin: '12px 0 8px' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>还没有账号？</Text>
        </Divider>

        <div style={{ textAlign: 'center' }}>
          <Button
            type="link"
            onClick={async () => {
              try {
                const res: any = await request.get('/auth/kook/bot-invite-url');
                if (res?.url) window.open(res.url, '_blank');
                else message.info('请联系管理员获取 BOT 邀请链接');
              } catch {
                message.info('请联系管理员获取 BOT 邀请链接');
              }
            }}
          >
            邀请 BOT 进入你的 KOOK 服务器
          </Button>
          <br />
          <Button type="link" onClick={() => navigate('/join')}>
            有邀请码？前往创建公会
          </Button>
        </div>
      </Card>
    </div>
  );
}

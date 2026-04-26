import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Typography, Spin, Result, Button } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';

const { Title, Text } = Typography;

/**
 * V2.9.4: KOOK OAuth 纯登录回调页
 * 路径: /auth/kook-callback?code=xxx
 *
 * 两种场景：
 * 1. popup 模式（window.opener 存在）→ postMessage 传回父窗口 → 关闭自身
 * 2. 直接跳转模式 → 登录成功后跳 dashboard/guild-select
 */
export default function KookCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuth } = useAuthStore();
  const { setGuilds, selectGuild } = useGuildStore();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const code = searchParams.get('code');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setErrorMsg('缺少授权码，请从登录页重新发起 KOOK 登录');
      return;
    }
    handleCallback(code);
  }, []);

  const handleCallback = async (authCode: string) => {
    try {
      const res: any = await request.post('/auth/kook/callback', {
        code: authCode,
        callbackPath: '/auth/kook-callback',
      });

      if (!res?.accessToken) {
        throw new Error('未获取到登录凭证');
      }

      // 保存登录状态
      setAuth(res.accessToken, res.user, res.refreshToken);
      if (res.guilds) {
        setGuilds(res.guilds);
        if (res.guilds.length > 0) selectGuild(res.guilds[0].guildId);
      }

      // popup 模式：传回父窗口
      if (window.opener) {
        window.opener.postMessage({ type: 'kook-oauth-success', data: res }, '*');
        window.close();
        return;
      }

      // 直接跳转模式
      setStatus('success');
      setTimeout(() => {
        if (res.user?.globalRole === 'ssvip') {
          navigate('/admin/dashboard', { replace: true });
        } else if (res.guilds?.length > 0) {
          navigate('/admin/dashboard', { replace: true });
        } else {
          navigate('/guild/select', { replace: true });
        }
      }, 1000);
    } catch (err: any) {
      setStatus('error');
      const msg = err?.response?.data?.message || err?.message || 'KOOK 授权失败';
      setErrorMsg(msg);

      // popup 模式也要处理错误
      if (window.opener) {
        window.opener.postMessage({ type: 'kook-oauth-error', error: msg }, '*');
        return;
      }
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 50%, #0050b3 100%)',
    }}>
      <Card style={{ width: 420, borderRadius: 12, textAlign: 'center' }} bordered={false}>
        {status === 'loading' && (
          <>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
            <Title level={4} style={{ marginTop: 24 }}>正在登录...</Title>
            <Text type="secondary">正在通过 KOOK 验证您的身份</Text>
          </>
        )}
        {status === 'success' && (
          <Result status="success" title="登录成功" subTitle="正在跳转..." />
        )}
        {status === 'error' && (
          <Result
            status="error"
            title="登录失败"
            subTitle={errorMsg}
            extra={[
              <Button key="retry" type="primary" onClick={() => navigate('/login', { replace: true })}>
                返回登录页
              </Button>,
            ]}
          />
        )}
      </Card>
    </div>
  );
}

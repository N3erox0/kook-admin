import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Steps, Form, Input, Button, Typography, message, Result, Space, Alert, List, Avatar, Spin, Tag } from 'antd';
import { KeyOutlined, CloudServerOutlined, CheckCircleOutlined, InfoCircleOutlined, UserOutlined, LockOutlined, LoadingOutlined } from '@ant-design/icons';
import request from '@/api/request';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { login as loginApi } from '@/api/auth';

const { Title, Text, Paragraph } = Typography;

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, setAuth, user } = useAuthStore();
  const { setGuilds, selectGuild } = useGuildStore();

  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [inviteCode, setInviteCode] = useState(searchParams.get('code') || searchParams.get('state') || '');
  const [kookGuildId, setKookGuildId] = useState('');
  const [guildInfo, setGuildInfo] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [createdGuild, setCreatedGuild] = useState<any>(null);
  const [kookUser, setKookUser] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // 检测 OAuth2 回调（URL 中有 code 参数，且不是邀请码格式）
  const oauthCode = searchParams.get('code');
  const isOAuthCallback = oauthCode && oauthCode.length > 20; // KOOK OAuth code 较长

  useEffect(() => {
    if (isOAuthCallback) {
      // OAuth2 回调：用 code 换 token
      handleOAuthCallback(oauthCode);
    }
  }, []);

  const handleOAuthCallback = async (code: string) => {
    setLoading(true);
    try {
      const res: any = await request.post('/auth/kook/callback', { code });
      if (res?.accessToken) {
        setAuth(res.accessToken, res.user, res.refreshToken);
        if (res.guilds) setGuilds(res.guilds);
        if (res.kookUser) setKookUser(res.kookUser);

        // 如果 state 参数带了邀请码，自动验证
        const stateCode = searchParams.get('state');
        if (stateCode) {
          setInviteCode(stateCode);
          // 自动验证邀请码
          try {
            const valRes: any = await request.post('/guilds/invite-codes/validate', { code: stateCode });
            if (valRes.valid) {
              message.success('KOOK 登录成功，邀请码已自动验证');
              setCurrent(2); // 跳到 KOOK 配置步骤
            } else {
              message.warning(valRes.message || '邀请码无效');
              setCurrent(0);
            }
          } catch {
            setCurrent(0);
          }
        } else {
          message.success('KOOK 登录成功');
          setCurrent(token ? 2 : 0);
        }
      }
    } catch {
      message.error('KOOK 授权失败，请重试');
    } finally { setLoading(false); }
  };

  // 发起 KOOK OAuth2 登录
  const handleKookLogin = async () => {
    setLoading(true);
    try {
      const res: any = await request.get('/auth/kook/oauth-url', {
        params: { invite_code: inviteCode.trim() || undefined },
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        message.error('获取 KOOK 授权链接失败');
        setLoading(false);
      }
    } catch {
      message.error('获取 KOOK 授权链接失败');
      setLoading(false);
    }
  };

  // 步骤0: 验证邀请码
  const handleValidateCode = async () => {
    if (!inviteCode.trim()) { message.warning('请输入邀请码'); return; }
    setLoading(true);
    try {
      const res: any = await request.post('/guilds/invite-codes/validate', { code: inviteCode.trim() });
      if (res.valid) {
        message.success('邀请码验证通过');
        setCurrent(token ? 2 : 1);
      } else {
        message.error(res.message || '邀请码无效');
      }
    } catch {} finally { setLoading(false); }
  };

  // 步骤1: 账号密码登录
  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await loginApi(values);
      setAuth(res.accessToken, res.user, res.refreshToken);
      if (res.guilds) setGuilds(res.guilds);
      message.success('登录成功');
      setCurrent(2);
    } catch {} finally { setLoading(false); }
  };

  // 步骤2: 获取 KOOK 服务器信息
  const handleFetchGuild = async () => {
    if (!kookGuildId.trim()) { message.warning('请输入 KOOK 服务器 ID'); return; }
    setLoading(true);
    try {
      const res: any = await request.get('/kook/guild-info', { params: { guild_id: kookGuildId.trim() } });
      const infoData = res?.data || res;
      if (infoData) {
        setGuildInfo(infoData);
        const chRes: any = await request.get('/kook/channels', { params: { guild_id: kookGuildId.trim() } });
        const chData = chRes?.data || chRes;
        if (Array.isArray(chData)) {
          setChannels(chData.filter((c: any) => c.type === 1));
        }
        setCurrent(3);
      } else {
        message.error('获取服务器信息失败，请检查服务器 ID 和 Bot 是否已加入');
      }
    } catch {
      message.error('无法连接 KOOK 服务器');
    } finally { setLoading(false); }
  };

  // 步骤3: 确认创建
  const handleCreate = async () => {
    if (selectedChannelIds.length === 0) { message.warning('请至少选择一个补装频道'); return; }
    setLoading(true);
    try {
      const res: any = await request.post('/guilds', {
        inviteCode: inviteCode.trim(),
        name: guildInfo?.name || `公会-${kookGuildId}`,
        iconUrl: guildInfo?.icon || '',
        kookGuildId: kookGuildId.trim(),
      });
      if (res?.id) {
        await request.put(`/guilds/${res.id}`, {
          kookListenChannelIds: selectedChannelIds,
          kookResupplyChannelId: selectedChannelIds[0],
        });
        setCreatedGuild(res);
        setCurrent(4);

        setSyncing(true);
        try {
          await request.post(`/guild/${res.id}/dashboard/sync-members`);
        } catch {}
        const profileRes: any = await request.get('/auth/profile');
        if (profileRes?.guilds) {
          setGuilds(profileRes.guilds);
          selectGuild(res.id);
        }
        setSyncing(false);
      }
    } catch {} finally { setLoading(false); }
  };

  if (isOAuthCallback && loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg, #0a1628 0%, #1a2a4a 50%, #0d1b2e 100%)' }}>
        <Card style={{ width: 400, textAlign: 'center', borderRadius: 16 }}>
          <Spin size="large" />
          <Title level={4} style={{ marginTop: 16 }}>正在完成 KOOK 授权...</Title>
        </Card>
      </div>
    );
  }

  const steps = [
    { title: '邀请码' },
    ...(token ? [] : [{ title: '身份验证' }]),
    { title: 'KOOK 配置' },
    { title: '选择频道' },
    { title: '完成' },
  ];

  const activeUser = user || kookUser;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a1628 0%, #1a2a4a 50%, #0d1b2e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <Card style={{ width: 640, borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #1677ff, #0050b3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12,
          }}>
            <KeyOutlined style={{ fontSize: 28, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>创建公会</Title>
          <Text type="secondary">使用邀请码创建你的 KOOK 公会管理空间</Text>
        </div>

        {/* 已登录用户身份展示 */}
        {activeUser && (
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <Space>
                <Text>当前身份：</Text>
                <Text strong>{activeUser.nickname || activeUser.username}</Text>
                {activeUser.kookUserId && <Tag color="blue">KOOK</Tag>}
              </Space>
            }
          />
        )}

        <Steps current={current > steps.length - 1 ? steps.length - 1 : current} items={steps} size="small" style={{ marginBottom: 32 }} />

        {/* 步骤0: 邀请码验证 */}
        {current === 0 && (
          <div>
            <Form layout="vertical">
              <Form.Item label="邀请码">
                <Input size="large" placeholder="请输入邀请码" value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)} onPressEnter={handleValidateCode} />
              </Form.Item>
            </Form>
            <Button type="primary" block size="large" loading={loading} onClick={handleValidateCode}>
              验证邀请码
            </Button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button type="link" onClick={() => navigate('/login')}>已有账号？去登录</Button>
            </div>
          </div>
        )}

        {/* 步骤1: 身份验证（未登录时） */}
        {current === 1 && !token && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
              邀请码验证通过，请选择登录方式
            </Text>

            <Button type="primary" block size="large" style={{ height: 48, marginBottom: 12, background: '#6b48ff' }}
              loading={loading} onClick={handleKookLogin}>
              使用 KOOK 账号登录（推荐）
            </Button>

            <div style={{ textAlign: 'center', margin: '12px 0', color: '#999' }}>— 或 —</div>

            <Form onFinish={handleLogin} size="large" autoComplete="off">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined />} placeholder="用户名" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              <Form.Item>
                <Button type="default" htmlType="submit" loading={loading} block style={{ height: 44 }}>
                  使用账号密码登录
                </Button>
              </Form.Item>
            </Form>
          </div>
        )}

        {/* 步骤2: KOOK 配置 */}
        {current === 2 && (
          <div>
            <Alert
              message="如何获取 KOOK 服务器 ID"
              description={
                <div>
                  <Paragraph style={{ margin: '4px 0' }}>1. 打开 KOOK → 设置 → 高级设置 → 开启「开发者模式」</Paragraph>
                  <Paragraph style={{ margin: '4px 0' }}>2. 右键服务器名称 → 复制 ID</Paragraph>
                  <Paragraph style={{ margin: '4px 0' }}>3. 右键管理员角色 → 复制 ID（可选，用于 @通知）</Paragraph>
                </div>
              }
              type="info" showIcon style={{ marginBottom: 16 }}
            />
            <Form layout="vertical">
              <Form.Item label="KOOK 服务器 ID" required>
                <Input size="large" placeholder="右键服务器名称 → 复制 ID" value={kookGuildId}
                  onChange={(e) => setKookGuildId(e.target.value)} />
              </Form.Item>
            </Form>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              <Button type="primary" size="large" loading={loading} onClick={handleFetchGuild}>获取服务器信息</Button>
            </Space>
          </div>
        )}

        {/* 步骤3: 选择频道（多选，与 GuildCreate 一致） */}
        {current === 3 && (
          <div>
            {guildInfo && (
              <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
                <Space>
                  {guildInfo.icon && <Avatar src={guildInfo.icon} size={48} shape="square" />}
                  <div>
                    <Title level={5} style={{ margin: 0 }}>{guildInfo.name}</Title>
                    <Text type="secondary">ID: {kookGuildId}</Text>
                  </div>
                </Space>
              </Card>
            )}
            <Title level={5}>选择补装监听频道</Title>
            <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
              系统将监听选中频道中的补装申请消息（已选 {selectedChannelIds.length} / {channels.length}）
            </Text>
            {channels.length > 0 ? (
              <List bordered size="small" style={{ maxHeight: 240, overflow: 'auto', marginBottom: 16 }}
                dataSource={channels}
                renderItem={(ch: any) => (
                  <List.Item
                    onClick={() => {
                      setSelectedChannelIds((prev) =>
                        prev.includes(ch.id) ? prev.filter((id: string) => id !== ch.id) : [...prev, ch.id]
                      );
                    }}
                    style={{ cursor: 'pointer', background: selectedChannelIds.includes(ch.id) ? '#e6f4ff' : undefined }}>
                    <Space>
                      <Text># {ch.name}</Text>
                      {selectedChannelIds.includes(ch.id) && <CheckCircleOutlined style={{ color: '#1677ff' }} />}
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Spin />}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(2)}>上一步</Button>
              <Button type="primary" size="large" loading={loading} onClick={handleCreate}
                disabled={selectedChannelIds.length === 0}>
                确认创建并绑定（{selectedChannelIds.length} 个频道）
              </Button>
            </Space>
          </div>
        )}

        {/* 步骤4: 完成 */}
        {current === 4 && (
          <Result
            status="success"
            title="公会创建成功！"
            subTitle={
              syncing
                ? '正在初始化数据，自动同步频道和成员信息...'
                : `「${createdGuild?.name || ''}」已创建，你已被设为超级管理员`
            }
            extra={
              syncing ? (
                <Space>
                  <LoadingOutlined style={{ fontSize: 24 }} />
                  <Text>正在同步...</Text>
                </Space>
              ) : (
                <Button type="primary" key="go" size="large" onClick={() => navigate('/admin/dashboard')}>
                  进入管理后台
                </Button>
              )
            }
          />
        )}

        <div style={{ textAlign: 'center', marginTop: 24, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <a href="/" style={{ color: '#999' }}>22bngm.online</a>
          </Text>
        </div>
      </Card>
    </div>
  );
}

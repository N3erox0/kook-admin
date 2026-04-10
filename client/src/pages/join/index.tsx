import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Steps, Form, Input, Button, Typography, message, Result, Space, Alert, List, Avatar, Spin } from 'antd';
import { KeyOutlined, CloudServerOutlined, CheckCircleOutlined, InfoCircleOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import request from '@/api/request';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import { login as loginApi } from '@/api/auth';

const { Title, Text, Paragraph } = Typography;

export default function JoinPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token, setAuth } = useAuthStore();
  const { setGuilds, selectGuild } = useGuildStore();

  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [inviteCode, setInviteCode] = useState(searchParams.get('code') || '');
  const [kookGuildId, setKookGuildId] = useState('');
  const [kookAdminRoleId, setKookAdminRoleId] = useState('');
  const [guildInfo, setGuildInfo] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [createdGuild, setCreatedGuild] = useState<any>(null);

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

  // 步骤1: 登录
  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res: any = await loginApi(values);
      setAuth(res.accessToken, res.user);
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
      if (res?.data) {
        setGuildInfo(res.data);
        const chRes: any = await request.get('/kook/channels', { params: { guild_id: kookGuildId.trim() } });
        if (chRes?.data) {
          setChannels(chRes.data.filter((c: any) => c.type === 1));
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
    if (!selectedChannelId) { message.warning('请选择补装频道'); return; }
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
          kookResupplyChannelId: selectedChannelId,
          kookAdminRoleId: kookAdminRoleId || '',
        });
        setCreatedGuild(res);
        const profileRes: any = await request.get('/auth/profile');
        if (profileRes?.guilds) {
          setGuilds(profileRes.guilds);
          selectGuild(res.id);
        }
        setCurrent(4);
      }
    } catch {} finally { setLoading(false); }
  };

  const steps = [
    { title: '邀请码' },
    ...(token ? [] : [{ title: '登录' }]),
    { title: 'KOOK 配置' },
    { title: '选择频道' },
    { title: '完成' },
  ];

  const effectiveCurrent = token && current === 1 ? 2 : current;

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

        <Steps current={current > (token ? 3 : 4) ? steps.length - 1 : Math.min(current, steps.length - 1)} items={steps} size="small" style={{ marginBottom: 32 }} />

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

        {/* 步骤1: 登录（未登录时） */}
        {current === 1 && !token && (
          <div>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16, textAlign: 'center' }}>
              邀请码验证通过，请登录后继续
            </Text>
            <Form onFinish={handleLogin} size="large" autoComplete="off">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined />} placeholder="用户名" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44 }}>
                  登录并继续
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
              <Form.Item label="管理员角色 ID（可选）">
                <Input placeholder="右键角色 → 复制 ID" value={kookAdminRoleId}
                  onChange={(e) => setKookAdminRoleId(e.target.value)} />
              </Form.Item>
            </Form>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              <Button type="primary" size="large" loading={loading} onClick={handleFetchGuild}>获取服务器信息</Button>
            </Space>
          </div>
        )}

        {/* 步骤3: 选择频道 */}
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
            <Title level={5}>选择补装消息频道</Title>
            <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
              系统将监听此频道中的补装申请消息
            </Text>
            {channels.length > 0 ? (
              <List bordered size="small" style={{ maxHeight: 240, overflow: 'auto', marginBottom: 16 }}
                dataSource={channels}
                renderItem={(ch: any) => (
                  <List.Item onClick={() => setSelectedChannelId(ch.id)}
                    style={{ cursor: 'pointer', background: selectedChannelId === ch.id ? '#e6f4ff' : undefined }}>
                    <Space>
                      <Text># {ch.name}</Text>
                      {selectedChannelId === ch.id && <CheckCircleOutlined style={{ color: '#1677ff' }} />}
                    </Space>
                  </List.Item>
                )}
              />
            ) : <Spin />}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(2)}>上一步</Button>
              <Button type="primary" size="large" loading={loading} onClick={handleCreate}>确认创建公会</Button>
            </Space>
          </div>
        )}

        {/* 步骤4: 完成 */}
        {current === 4 && (
          <Result
            status="success"
            title="公会创建成功！"
            subTitle={`「${createdGuild?.name || ''}」已创建，你已被设为超级管理员`}
            extra={[
              <Button type="primary" key="go" size="large" onClick={() => navigate('/dashboard')}>
                进入管理后台
              </Button>,
            ]}
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

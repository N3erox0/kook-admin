import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Steps, Form, Input, Button, Typography, message, Result, Space, Alert, List, Avatar, Spin, Select } from 'antd';
import { KeyOutlined, CloudServerOutlined, CheckCircleOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';

const { Title, Text, Paragraph } = Typography;

export default function GuildCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setGuilds, selectGuild } = useGuildStore();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);

  const [inviteCode, setInviteCode] = useState('');
  const [kookGuildId, setKookGuildId] = useState('');
  const [kookAdminRoleId, setKookAdminRoleId] = useState('');
  const [guildInfo, setGuildInfo] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [createdGuild, setCreatedGuild] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  // 步骤1：验证邀请码
  const handleValidateCode = async () => {
    if (!inviteCode.trim()) { message.warning('请输入邀请码'); return; }
    setLoading(true);
    try {
      const res: any = await request.post('/guilds/invite-codes/validate', { code: inviteCode.trim() });
      if (res.valid) {
        message.success('邀请码验证通过');
        setCurrent(1);
      } else {
        message.error(res.message || '邀请码无效');
      }
    } catch {} finally { setLoading(false); }
  };

  // 步骤2：获取 KOOK 服务器信息
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
        setCurrent(2);
      } else {
        message.error('获取服务器信息失败，请检查服务器 ID');
      }
    } catch {
      message.error('无法连接到 KOOK 服务器，请确认 Bot 已加入该服务器');
    } finally { setLoading(false); }
  };

  // 步骤3：确认创建 + 自动异步同步
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
        setCurrent(3);

        // 异步触发数据同步
        setSyncing(true);
        try {
          await request.post(`/guild/${res.id}/dashboard/sync-members`);
        } catch {}

        // 刷新公会列表并自动选中
        const profileRes: any = await request.get('/auth/profile');
        if (profileRes?.guilds) {
          setGuilds(profileRes.guilds);
          selectGuild(res.id);
        }
        setSyncing(false);
      }
    } catch {} finally { setLoading(false); }
  };

  const steps = [
    { title: '验证邀请码', icon: <KeyOutlined /> },
    { title: 'KOOK 配置', icon: <CloudServerOutlined /> },
    { title: '选择频道', icon: <InfoCircleOutlined /> },
    { title: '完成', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f5', padding: 24,
    }}>
      <Card style={{ width: 640, borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4}>
            {user ? '添加新公会' : '创建公会'}
          </Title>
          {user && (
            <Text type="secondary">
              当前账号：{user.nickname || user.username}（无需重新登录）
            </Text>
          )}
        </div>

        <Steps current={current} items={steps} size="small" style={{ marginBottom: 32 }} />

        {/* 步骤1：邀请码 */}
        {current === 0 && (
          <div>
            <Form layout="vertical">
              <Form.Item label="邀请码">
                <Input
                  size="large"
                  placeholder="请输入邀请码"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  onPressEnter={handleValidateCode}
                />
              </Form.Item>
            </Form>
            <Button type="primary" block size="large" loading={loading} onClick={handleValidateCode}>
              验证邀请码
            </Button>
          </div>
        )}

        {/* 步骤2：KOOK 服务器配置 */}
        {current === 1 && (
          <div>
            <Alert
              message="如何获取 KOOK ID"
              description={
                <div>
                  <Paragraph>1. 打开 KOOK 客户端 → 设置 → 高级设置 → 开启「开发者模式」</Paragraph>
                  <Paragraph>2. 右键点击服务器名称 → 复制 ID（即服务器 ID）</Paragraph>
                  <Paragraph>3. 右键点击管理员角色 → 复制 ID（即角色 ID，可选）</Paragraph>
                </div>
              }
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form layout="vertical">
              <Form.Item label="KOOK 服务器 ID" required>
                <Input
                  size="large"
                  placeholder="右键服务器名称 → 复制 ID"
                  value={kookGuildId}
                  onChange={(e) => setKookGuildId(e.target.value)}
                />
              </Form.Item>
              <Form.Item label="管理员角色 ID（可选，用于消息通知 @角色）">
                <Input
                  placeholder="右键角色 → 复制 ID"
                  value={kookAdminRoleId}
                  onChange={(e) => setKookAdminRoleId(e.target.value)}
                />
              </Form.Item>
            </Form>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={handleFetchGuild}>
                获取服务器信息
              </Button>
            </Space>
          </div>
        )}

        {/* 步骤3：选择频道（显示公会图标和名称） */}
        {current === 2 && (
          <div>
            {guildInfo && (
              <Card size="small" style={{ marginBottom: 16 }}>
                <Space>
                  {guildInfo.icon && <Avatar src={guildInfo.icon} size={48} shape="square" />}
                  <div>
                    <Title level={5} style={{ margin: 0 }}>{guildInfo.name}</Title>
                    <Text type="secondary">服务器 ID: {kookGuildId}</Text>
                  </div>
                </Space>
              </Card>
            )}

            <Title level={5}>选择补装频道</Title>
            <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
              选择用于接收补装申请消息的文字频道
            </Text>

            {channels.length > 0 ? (
              <List
                bordered
                size="small"
                style={{ maxHeight: 250, overflow: 'auto', marginBottom: 16 }}
                dataSource={channels}
                renderItem={(ch: any) => (
                  <List.Item
                    onClick={() => setSelectedChannelId(ch.id)}
                    style={{
                      cursor: 'pointer',
                      background: selectedChannelId === ch.id ? '#e6f4ff' : undefined,
                    }}
                  >
                    <Space>
                      <Text># {ch.name}</Text>
                      {selectedChannelId === ch.id && <CheckCircleOutlined style={{ color: '#1677ff' }} />}
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <Spin />
            )}

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(1)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={handleCreate}>
                确认创建并绑定
              </Button>
            </Space>
          </div>
        )}

        {/* 步骤4：完成（含同步状态） */}
        {current === 3 && (
          <div>
            <Result
              status="success"
              title="新公会绑定成功！"
              subTitle={
                syncing
                  ? '正在初始化数据，自动同步频道和成员信息...'
                  : `公会「${createdGuild?.name || ''}」已创建，你已被设为超级管理员。`
              }
              extra={
                syncing ? (
                  <Space>
                    <LoadingOutlined style={{ fontSize: 24 }} />
                    <Text>正在同步成员数据...</Text>
                  </Space>
                ) : (
                  <Button type="primary" key="dashboard" onClick={() => navigate('/admin/dashboard')}>
                    进入控制台
                  </Button>
                )
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}

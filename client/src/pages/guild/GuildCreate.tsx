import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Steps, Form, Input, Button, Typography, message, Result, Space, Alert, Avatar, Spin, Select, Checkbox } from 'antd';
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
  const [guildInfo, setGuildInfo] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [createdGuild, setCreatedGuild] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [botGuilds, setBotGuilds] = useState<{ id: string; name: string; icon: string }[]>([]);
  const [loadingBotGuilds, setLoadingBotGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // 步骤1：验证邀请码
  const handleValidateCode = async () => {
    if (!inviteCode.trim()) { message.warning('请输入邀请码'); return; }
    setLoading(true);
    try {
      const res: any = await request.post('/guilds/invite-codes/validate', { code: inviteCode.trim() });
      if (res.valid) {
        message.success('邀请码验证通过');
        setCurrent(1);
        fetchBotGuilds();
      } else {
        message.error(res.message || '邀请码无效');
      }
    } catch {} finally { setLoading(false); }
  };

  // 获取 Bot 已加入的服务器列表
  const fetchBotGuilds = async () => {
    setLoadingBotGuilds(true);
    try {
      const res: any = await request.get('/kook/bot-guilds');
      const list = Array.isArray(res) ? res : (res?.data || []);
      if (Array.isArray(list)) {
        setBotGuilds(list);
      }
    } catch {
      message.warning('获取 Bot 服务器列表失败，请手动输入服务器 ID');
    } finally { setLoadingBotGuilds(false); }
  };

  // 选择服务器后自动获取信息和频道列表
  const handleSelectGuild = async (guildId: string) => {
    setKookGuildId(guildId);
    setGuildInfo(null);
    setChannels([]);
    setSelectedChannelIds([]);
    setLoadingChannels(true);
    try {
      const [infoRes, chRes]: any[] = await Promise.all([
        request.get('/kook/guild-info', { params: { guild_id: guildId } }),
        request.get('/kook/channels', { params: { guild_id: guildId } }),
      ]);
      const infoData = infoRes?.data || infoRes;
      const chData = chRes?.data || chRes;
      if (infoData) setGuildInfo(infoData);
      if (Array.isArray(chData)) {
        setChannels(chData.filter((c: any) => c.type === 1));
      }
    } catch {
      message.error('获取服务器信息失败');
    } finally { setLoadingChannels(false); }
  };

  // 手动输入模式下点击按钮获取
  const handleFetchGuild = async (): Promise<boolean> => {
    if (!kookGuildId.trim()) { message.warning('请输入 KOOK 服务器 ID'); return false; }
    setLoadingChannels(true);
    try {
      const [infoRes, chRes]: any[] = await Promise.all([
        request.get('/kook/guild-info', { params: { guild_id: kookGuildId.trim() } }),
        request.get('/kook/channels', { params: { guild_id: kookGuildId.trim() } }),
      ]);
      const infoData = infoRes?.data || infoRes;
      const chData = chRes?.data || chRes;
      if (infoData) {
        setGuildInfo(infoData);
        if (Array.isArray(chData)) {
          setChannels(chData.filter((c: any) => c.type === 1));
        }
        return true;
      }
      message.error('获取服务器信息失败');
      return false;
    } catch {
      message.error('获取服务器信息失败');
      return false;
    } finally { setLoadingChannels(false); }
  };

  // 步骤2 → 步骤3
  const handleGoToChannels = () => {
    if (!kookGuildId) { message.warning('请选择服务器'); return; }
    if (!guildInfo) { message.warning('服务器信息尚未加载'); return; }
    setCurrent(2);
  };

  // 步骤3：确认创建
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
        setCurrent(3);

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

  // 频道全选/取消
  const handleToggleAll = (checked: boolean) => {
    setSelectedChannelIds(checked ? channels.map((c) => c.id) : []);
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
            {botGuilds.length > 0 ? (
              <>
                <Alert
                  message="选择 Bot 已加入的服务器"
                  description="选择服务器后将自动获取频道列表。如果目标服务器不在列表中，请先将 Bot 邀请进该服务器。"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Form layout="vertical">
                  <Form.Item label="选择 KOOK 服务器" required>
                    <Select
                      size="large"
                      placeholder="请选择服务器"
                      value={kookGuildId || undefined}
                      onChange={handleSelectGuild}
                      loading={loadingBotGuilds}
                      showSearch
                      optionFilterProp="label"
                      options={botGuilds.map((g) => ({
                        value: g.id,
                        label: g.name,
                      }))}
                    />
                  </Form.Item>
                </Form>

                {/* 选择服务器后显示服务器信息预览 */}
                {loadingChannels && (
                  <div style={{ textAlign: 'center', padding: 16 }}>
                    <Spin tip="正在获取服务器信息..." />
                  </div>
                )}
                {guildInfo && !loadingChannels && (
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Space>
                      {guildInfo.icon && <Avatar src={guildInfo.icon} size={48} shape="square" />}
                      <div>
                        <Title level={5} style={{ margin: 0 }}>{guildInfo.name}</Title>
                        <Text type="secondary">服务器 ID: {kookGuildId} · {channels.length} 个文字频道</Text>
                      </div>
                    </Space>
                  </Card>
                )}
              </>
            ) : (
              <>
                <Alert
                  message={loadingBotGuilds ? '正在加载 Bot 服务器列表...' : '未获取到 Bot 服务器列表，请手动输入'}
                  description={
                    !loadingBotGuilds && (
                      <div>
                        <Paragraph>1. 打开 KOOK 客户端 → 设置 → 高级设置 → 开启「开发者模式」</Paragraph>
                        <Paragraph>2. 右键点击服务器名称 → 复制 ID（即服务器 ID）</Paragraph>
                      </div>
                    )
                  }
                  type={loadingBotGuilds ? 'info' : 'warning'}
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
                </Form>
              </>
            )}
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(0)}>上一步</Button>
              {botGuilds.length > 0 ? (
                <Button type="primary" disabled={!guildInfo || loadingChannels} onClick={handleGoToChannels}>
                  下一步：选择频道
                </Button>
              ) : (
                <Button type="primary" loading={loading} onClick={async () => {
                  const success = await handleFetchGuild();
                  if (success) setCurrent(2);
                }}>
                  获取服务器信息
                </Button>
              )}
            </Space>
          </div>
        )}

        {/* 步骤3：选择频道（多选） */}
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

            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Title level={5} style={{ margin: 0, display: 'inline' }}>选择补装监听频道</Title>
                <Text type="secondary" style={{ marginLeft: 8 }}>
                  已选 {selectedChannelIds.length} / {channels.length} 个频道
                </Text>
              </div>
              <Checkbox
                checked={channels.length > 0 && selectedChannelIds.length === channels.length}
                indeterminate={selectedChannelIds.length > 0 && selectedChannelIds.length < channels.length}
                onChange={(e) => handleToggleAll(e.target.checked)}
              >
                全选
              </Checkbox>
            </div>
            <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
              选中的频道中的图片消息将被识别为补装申请来源，规则一致
            </Text>

            {channels.length > 0 ? (
              <div style={{ maxHeight: 300, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 8, marginBottom: 16 }}>
                <Checkbox.Group
                  value={selectedChannelIds}
                  onChange={(values) => setSelectedChannelIds(values as string[])}
                  style={{ width: '100%' }}
                >
                  {channels.map((ch: any) => (
                    <div
                      key={ch.id}
                      style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        background: selectedChannelIds.includes(ch.id) ? '#e6f4ff' : undefined,
                      }}
                      onClick={() => {
                        setSelectedChannelIds((prev) =>
                          prev.includes(ch.id) ? prev.filter((id) => id !== ch.id) : [...prev, ch.id]
                        );
                      }}
                    >
                      <Checkbox value={ch.id} onClick={(e) => e.stopPropagation()}>
                        <Text style={{ marginLeft: 4 }}># {ch.name}</Text>
                      </Checkbox>
                    </div>
                  ))}
                </Checkbox.Group>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 24 }}>
                <Spin tip="加载频道列表..." />
              </div>
            )}

            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button onClick={() => setCurrent(1)}>上一步</Button>
              <Button type="primary" loading={loading} onClick={handleCreate}
                disabled={selectedChannelIds.length === 0}>
                确认创建并绑定（{selectedChannelIds.length} 个频道）
              </Button>
            </Space>
          </div>
        )}

        {/* 步骤4：完成 */}
        {current === 3 && (
          <div>
            <Result
              status="success"
              title="新公会绑定成功！"
              subTitle={
                syncing
                  ? '正在初始化数据，自动同步频道和成员信息...'
                  : `公会「${createdGuild?.name || ''}」已创建，已绑定 ${selectedChannelIds.length} 个监听频道。`
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

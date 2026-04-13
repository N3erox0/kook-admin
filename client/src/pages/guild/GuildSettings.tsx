import { useState, useEffect } from 'react';
import { Card, Typography, Form, Input, Button, Checkbox, Space, message, Spin, List, Tag, Collapse } from 'antd';
import { SaveOutlined, ReloadOutlined, WifiOutlined, SettingOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { getGuild, updateGuild } from '@/api/guild';
import request from '@/api/request';

const { Title, Text } = Typography;

export default function GuildSettingsPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [guild, setGuild] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [form] = Form.useForm();

  const fetchGuild = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getGuild(guildId);
      setGuild(res);
      form.setFieldsValue({
        kookBotToken: res.kookBotToken,
        kookVerifyToken: res.kookVerifyToken,
        kookAdminChannelId: res.kookAdminChannelId,
        kookAdminRoleId: res.kookAdminRoleId,
      });
      setSelectedChannels(res.kookListenChannelIds || []);
    } catch {} finally { setLoading(false); }
  };

  const fetchChannels = async () => {
    setChannelsLoading(true);
    try {
      const res: any = await request.get('/kook/channels', { params: { guild_id: guild?.kookGuildId } });
      const list = Array.isArray(res) ? res : (res?.data || []);
      setChannels(Array.isArray(list) ? list : []);
    } catch { setChannels([]); } finally { setChannelsLoading(false); }
  };

  useEffect(() => {
    fetchGuild().then(() => {
      // 自动加载频道列表
      if (guild?.kookGuildId) fetchChannels();
    });
  }, [guildId]);

  // guild变化后也自动拉频道
  useEffect(() => {
    if (guild?.kookGuildId && channels.length === 0) fetchChannels();
  }, [guild?.kookGuildId]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      await updateGuild(guildId, {
        ...values,
        kookListenChannelIds: selectedChannels,
        kookResupplyChannelId: selectedChannels[0] || '',
      });
      message.success('设置已保存');
    } catch {} finally { setSaving(false); }
  };

  const handleChannelToggle = (channelId: string, checked: boolean) => {
    setSelectedChannels(prev =>
      checked ? [...prev, channelId] : prev.filter(id => id !== channelId)
    );
  };

  return (
    <Spin spinning={loading}>
      <Title level={4}>公会设置</Title>

      {/* 基础配置：频道选择 */}
      <Card
        title={<Space><WifiOutlined />监听频道配置</Space>}
        style={{ marginBottom: 16 }}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchChannels} loading={channelsLoading}>获取频道列表</Button>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          选择需要监听补装消息的频道（已选 {selectedChannels.length} 个）
        </Text>
        {channels.length > 0 ? (
          <List size="small" dataSource={channels.filter((c: any) => !c.is_category && c.type === 1)} renderItem={(ch: any) => (
            <List.Item>
              <Checkbox checked={selectedChannels.includes(ch.id)} onChange={e => handleChannelToggle(ch.id, e.target.checked)}>
                <Space>
                  <Text># {ch.name}</Text>
                  {selectedChannels.includes(ch.id) && <Tag color="blue">已选</Tag>}
                </Space>
              </Checkbox>
            </List.Item>
          )} />
        ) : (
          <Text type="secondary">点击右上角"获取频道列表"加载频道</Text>
        )}
        {channels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => handleSave(form.getFieldsValue())} loading={saving}>
              保存频道选择 ({selectedChannels.length} 个已选)
            </Button>
          </div>
        )}
      </Card>

      {/* 通知配置 */}
      <Card title="通知配置" style={{ marginBottom: 16 }}>
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="kookAdminChannelId" label="管理员通知频道 ID" tooltip="预警消息推送到哪个频道">
            <Input placeholder="频道ID（可从上方频道列表找到）" />
          </Form.Item>
          <Form.Item name="kookAdminRoleId" label="管理员角色 ID（@通知用）" tooltip="预警推送时@的角色ID">
            <Input placeholder="角色ID" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存通知配置</Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 高级配置（折叠） */}
      <Collapse
        items={[{
          key: 'advanced',
          label: <Space><SettingOutlined /><Text>高级配置（Bot Token / Verify Token）</Text></Space>,
          children: (
            <Form form={form} onFinish={handleSave} layout="vertical">
              <Form.Item name="kookBotToken" label="Bot Token" tooltip="KOOK 开放平台的 Bot Token，每个公会可独立配置">
                <Input.Password placeholder="KOOK Bot Token" />
              </Form.Item>
              <Form.Item name="kookVerifyToken" label="Verify Token" tooltip="Webhook 验证 Token，用于验证 KOOK 推送消息的合法性">
                <Input placeholder="Webhook Verify Token" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存高级配置</Button>
              </Form.Item>
            </Form>
          ),
        }]}
      />

      {/* 公会信息展示 */}
      {guild && (
        <Card size="small" style={{ marginTop: 16, background: '#fafafa' }}>
          <Space direction="vertical" size="small">
            <Text><Text strong>公会名称：</Text>{guild.name}</Text>
            <Text><Text strong>KOOK 服务器 ID：</Text>{guild.kookGuildId || '未配置'}</Text>
            <Text><Text strong>创建时间：</Text>{guild.createdAt}</Text>
          </Space>
        </Card>
      )}
    </Spin>
  );
}

import { useState, useEffect } from 'react';
import { Card, Typography, Form, Input, Button, Checkbox, Space, message, Spin, List, Tag } from 'antd';
import { SaveOutlined, ReloadOutlined, WifiOutlined } from '@ant-design/icons';
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
        kookResupplyChannelId: res.kookResupplyChannelId,
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
      setChannels(res?.data || res || []);
    } catch { setChannels([]); } finally { setChannelsLoading(false); }
  };

  useEffect(() => { fetchGuild(); }, [guildId]);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      await updateGuild(guildId, { ...values, kookListenChannelIds: selectedChannels });
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

      <Card title="KOOK Bot 配置" style={{ marginBottom: 16 }}>
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="kookBotToken" label="Bot Token"><Input.Password placeholder="KOOK Bot Token" /></Form.Item>
          <Form.Item name="kookVerifyToken" label="Verify Token"><Input placeholder="Webhook Verify Token" /></Form.Item>
          <Form.Item name="kookResupplyChannelId" label="补装申请监听频道 ID"><Input placeholder="频道ID" /></Form.Item>
          <Form.Item name="kookAdminChannelId" label="管理员通知频道 ID"><Input placeholder="频道ID" /></Form.Item>
          <Form.Item name="kookAdminRoleId" label="管理员角色 ID（@用）"><Input placeholder="角色ID" /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存配置</Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title={<Space><WifiOutlined />频道选择（勾选要监听的频道）</Space>}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchChannels} loading={channelsLoading}>获取频道列表</Button>}>
        {channels.length > 0 ? (
          <List size="small" dataSource={channels.filter((c: any) => !c.is_category && c.type === 1)} renderItem={(ch: any) => (
            <List.Item>
              <Checkbox checked={selectedChannels.includes(ch.id)} onChange={e => handleChannelToggle(ch.id, e.target.checked)}>
                <Space>
                  <Text>{ch.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>({ch.id})</Text>
                  {selectedChannels.includes(ch.id) && <Tag color="blue">已选</Tag>}
                </Space>
              </Checkbox>
            </List.Item>
          )} />
        ) : (
          <Text type="secondary">请先配置 Bot Token 并点击"获取频道列表"</Text>
        )}
        {channels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => handleSave(form.getFieldsValue())} loading={saving}>
              保存频道选择 ({selectedChannels.length} 个已选)
            </Button>
          </div>
        )}
      </Card>
    </Spin>
  );
}

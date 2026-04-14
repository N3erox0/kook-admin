import { useState, useEffect } from 'react';
import { Card, Typography, Form, Button, Checkbox, Space, Select, message, Spin, List, Tag } from 'antd';
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
  const [roles, setRoles] = useState<any[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchGuild = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getGuild(guildId);
      setGuild(res);
      form.setFieldsValue({
        kookAdminChannelId: res.kookAdminChannelId,
        kookAdminRoleId: res.kookAdminRoleId,
      });
      setSelectedChannels(res.kookListenChannelIds || []);
    } catch {} finally { setLoading(false); }
  };

  const fetchChannels = async () => {
    if (!guild?.kookGuildId) { message.warning('公会未绑定 KOOK 服务器'); return; }
    setChannelsLoading(true);
    try {
      const res: any = await request.get('/kook/channels', { params: { guild_id: guild.kookGuildId } });
      const list = Array.isArray(res) ? res : (res?.data || []);
      setChannels(Array.isArray(list) ? list : []);
      if (res?.error) message.warning(res.error);
    } catch { setChannels([]); } finally { setChannelsLoading(false); }
  };

  const fetchRoles = async () => {
    if (!guild?.kookGuildId) return;
    setRolesLoading(true);
    try {
      const res: any = await request.get('/kook/roles', { params: { guild_id: guild.kookGuildId } });
      const list = Array.isArray(res) ? res : (res?.data || res?.items || []);
      setRoles(Array.isArray(list) ? list : []);
    } catch { setRoles([]); } finally { setRolesLoading(false); }
  };

  useEffect(() => { fetchGuild(); }, [guildId]);

  useEffect(() => {
    if (guild?.kookGuildId) {
      if (channels.length === 0) fetchChannels();
      if (roles.length === 0) fetchRoles();
    }
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
    } catch {
      message.error('保存失败');
    } finally { setSaving(false); }
  };

  const handleChannelToggle = (channelId: string, checked: boolean) => {
    setSelectedChannels(prev =>
      checked ? [...prev, channelId] : prev.filter(id => id !== channelId)
    );
  };

  const textChannels = channels.filter((c: any) => !c.is_category && c.type === 1);

  return (
    <Spin spinning={loading}>
      <Title level={4}>公会设置</Title>

      {/* 监听频道配置 */}
      <Card
        title={<Space><WifiOutlined />监听频道配置</Space>}
        style={{ marginBottom: 16 }}
        extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchChannels} loading={channelsLoading}>获取频道列表</Button>}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          选择需要监听补装消息的频道（已选 {selectedChannels.length} 个）
        </Text>
        {textChannels.length > 0 ? (
          <List size="small" dataSource={textChannels} renderItem={(ch: any) => (
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
        {textChannels.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Button type="primary" onClick={() => handleSave(form.getFieldsValue())} loading={saving}>
              保存频道选择 ({selectedChannels.length} 个已选)
            </Button>
          </div>
        )}
      </Card>

      {/* 通知配置 — 频道和角色都改为下拉选择 */}
      <Card title="通知配置" style={{ marginBottom: 16 }}>
        <Form form={form} onFinish={handleSave} layout="vertical">
          <Form.Item name="kookAdminChannelId" label="管理员通知频道" tooltip="预警消息推送到哪个频道">
            <Select
              placeholder={textChannels.length > 0 ? '选择通知频道' : '请先获取频道列表'}
              allowClear
              showSearch
              optionFilterProp="label"
              loading={channelsLoading}
              options={textChannels.map((ch: any) => ({ value: ch.id, label: `# ${ch.name}` }))}
            />
          </Form.Item>
          <Form.Item name="kookAdminRoleId" label="管理员角色（@通知用）" tooltip="预警推送时@的角色">
            <Select
              placeholder={roles.length > 0 ? '选择管理员角色' : '正在加载角色列表...'}
              allowClear
              showSearch
              optionFilterProp="label"
              loading={rolesLoading}
              options={roles.map((r: any) => ({ value: String(r.role_id || r.id), label: r.name || `角色${r.role_id || r.id}` }))}
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>保存通知配置</Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 公会信息展示 */}
      {guild && (
        <Card size="small" style={{ background: '#fafafa' }}>
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

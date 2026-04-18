import { useState, useEffect } from 'react';
import { Card, Typography, Form, Button, Checkbox, Space, Select, message, Spin, List, Tag, Modal, Input } from 'antd';
import { SaveOutlined, ReloadOutlined, WifiOutlined, UserAddOutlined, CopyOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { getGuild, updateGuild, createSubAccount } from '@/api/guild';
import request from '@/api/request';

const { Title, Text, Paragraph } = Typography;

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

  // F-102C: 一键创建子账号
  const [subAccountModal, setSubAccountModal] = useState(false);
  const [subAccountRole, setSubAccountRole] = useState<string>('normal');
  const [subAccountNickname, setSubAccountNickname] = useState<string>('');
  const [subAccountCreating, setSubAccountCreating] = useState(false);
  const [subAccountResult, setSubAccountResult] = useState<{ username: string; password: string; nickname: string } | null>(null);

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

  /** F-102C: 创建子账号 */
  const handleCreateSubAccount = async () => {
    setSubAccountCreating(true);
    try {
      const res: any = await createSubAccount(guildId, {
        role: subAccountRole,
        nickname: subAccountNickname.trim() || undefined,
      });
      setSubAccountResult({
        username: res.username,
        password: res.password,
        nickname: res.nickname,
      });
      message.success('子账号创建成功，请立即复制密码（仅显示一次）');
    } catch (err: any) {
      message.error(err?.message || '创建失败');
    } finally {
      setSubAccountCreating(false);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label} 已复制`);
    } catch {
      message.warning('复制失败，请手动复制');
    }
  };

  const handleCloseSubAccountModal = () => {
    setSubAccountModal(false);
    setSubAccountResult(null);
    setSubAccountRole('normal');
    setSubAccountNickname('');
  };

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
        <Card size="small" style={{ background: '#fafafa', marginBottom: 16 }}>
          <Space direction="vertical" size="small">
            <Text><Text strong>公会名称：</Text>{guild.name}</Text>
            <Text><Text strong>KOOK 服务器 ID：</Text>{guild.kookGuildId || '未配置'}</Text>
            <Text><Text strong>创建时间：</Text>{guild.createdAt}</Text>
          </Space>
        </Card>
      )}

      {/* F-102C: 一键创建子账号（超管专用） */}
      <Card title={<Space><UserAddOutlined />成员管理工具</Space>}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">
            为其他管理员快速创建登录账号（不需要 KOOK OAuth 授权）。
            系统自动生成用户名和密码，一次性显示，请务必妥善保存。
          </Text>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setSubAccountModal(true)}>
            一键创建子账号
          </Button>
        </Space>
      </Card>

      {/* 子账号创建 Modal */}
      <Modal
        title="一键创建子账号"
        open={subAccountModal}
        onCancel={handleCloseSubAccountModal}
        footer={null}
        centered
        width={520}
        destroyOnClose
      >
        {!subAccountResult ? (
          <>
            <Paragraph type="secondary">
              系统会自动生成用户名（格式：公会缩写 + 2随机字母 + 4随机数字）和 8 位随机密码。
              创建后账号密码<Text strong type="danger">仅显示一次</Text>，关闭后无法再次查看。
            </Paragraph>
            <Form layout="vertical">
              <Form.Item label="子账号角色">
                <Select value={subAccountRole} onChange={setSubAccountRole}
                  options={[
                    { value: 'normal', label: '普通用户（仅查看）' },
                    { value: 'resupply_staff', label: '补装管理员' },
                    { value: 'inventory_admin', label: '库存管理员' },
                    { value: 'super_admin', label: '超级管理员（全权限）' },
                  ]}
                />
              </Form.Item>
              <Form.Item label="昵称（可选，不填则自动生成）">
                <Input value={subAccountNickname} onChange={e => setSubAccountNickname(e.target.value)}
                  placeholder={`${guild?.name || 'GUILD'}-子账号-xxxx`} />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button onClick={handleCloseSubAccountModal}>取消</Button>
                  <Button type="primary" loading={subAccountCreating} onClick={handleCreateSubAccount}>
                    确认创建
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        ) : (
          <div>
            <Paragraph type="warning" style={{ background: '#fff7e6', padding: 12, borderRadius: 6, border: '1px solid #ffd591' }}>
              <Text strong style={{ color: '#ad4e00' }}>⚠ 请立即复制并保存账号密码</Text>
              <br />
              关闭此窗口后，<Text strong type="danger">密码无法再次查看</Text>。
            </Paragraph>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Text strong style={{ width: 80 }}>用户名：</Text>
                <Input value={subAccountResult.username} readOnly style={{ fontFamily: 'monospace' }}
                  addonAfter={<Button type="link" size="small" icon={<CopyOutlined />}
                    onClick={() => handleCopy(subAccountResult.username, '用户名')}>复制</Button>}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Text strong style={{ width: 80 }}>密码：</Text>
                <Input value={subAccountResult.password} readOnly style={{ fontFamily: 'monospace', color: '#d4380d' }}
                  addonAfter={<Button type="link" size="small" icon={<CopyOutlined />}
                    onClick={() => handleCopy(subAccountResult.password, '密码')}>复制</Button>}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <Text strong style={{ width: 80 }}>昵称：</Text>
                <Input value={subAccountResult.nickname} readOnly />
              </div>
              <Button type="primary" block icon={<CopyOutlined />} style={{ marginTop: 8 }}
                onClick={() => handleCopy(
                  `账号：${subAccountResult.username}\n密码：${subAccountResult.password}\n昵称：${subAccountResult.nickname}`,
                  '完整账号信息',
                )}
              >
                复制完整账号信息
              </Button>
              <Button block onClick={handleCloseSubAccountModal}>我已保存，关闭</Button>
            </Space>
          </div>
        )}
      </Modal>
    </Spin>
  );
}

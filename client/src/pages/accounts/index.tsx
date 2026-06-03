import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, message, Modal, Form, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, KeyOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const ROLE_OPTIONS = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'inventory_admin', label: '库存管理员' },
  { value: 'resupply_staff', label: '补装管理员' },
  { value: 'normal', label: '普通用户' },
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'red',
  inventory_admin: 'blue',
  resupply_staff: 'green',
  normal: 'default',
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  inventory_admin: '库存管理员',
  resupply_staff: '补装管理员',
  normal: '普通用户',
};

const SOURCE_OPTIONS = [
  { value: '', label: '全部来源' },
  { value: 'manual', label: '手动创建' },
  { value: 'kook_oauth', label: 'KOOK 登录' },
  { value: 'invite_code', label: '邀请码' },
  { value: 'kook_sync', label: 'KOOK 同步' },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动创建',
  kook_oauth: 'KOOK 登录',
  invite_code: '邀请码',
  kook_sync: 'KOOK 同步',
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'gold',
  kook_oauth: 'blue',
  invite_code: 'cyan',
  kook_sync: 'default',
};

/** V3.2 登录账号管理（仅超管） */
export default function AccountsPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;

  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);

  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [pwdModal, setPwdModal] = useState<{ open: boolean; member?: any }>({ open: false });
  const [pwdForm] = Form.useForm();

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 50 };
      if (keyword) params.keyword = keyword;
      if (source) params.source = source;
      const res: any = await request.get(`/guild/${guildId}/accounts`, { params });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchList(1); }, [guildId]);

  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateSubmitting(true);
      await request.post(`/guild/${guildId}/accounts`, values);
      message.success('账号创建成功');
      createForm.resetFields();
      setCreateModal(false);
      fetchList(1);
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    } finally { setCreateSubmitting(false); }
  };

  const handleRoleChange = async (memberId: number, role: string) => {
    try {
      await request.put(`/guild/${guildId}/accounts/${memberId}`, { role });
      message.success('角色已更新');
      fetchList();
    } catch (err: any) { message.error(err?.message || '更新失败'); }
  };

  const handleStatusToggle = async (record: any) => {
    try {
      await request.put(`/guild/${guildId}/accounts/${record.id}`, {
        status: record.status === 1 ? 0 : 1,
      });
      message.success(record.status === 1 ? '已禁用' : '已启用');
      fetchList();
    } catch (err: any) { message.error(err?.message || '操作失败'); }
  };

  const handleResetPassword = async () => {
    try {
      const values = await pwdForm.validateFields();
      await request.post(`/guild/${guildId}/accounts/${pwdModal.member?.id}/reset-password`, values);
      message.success('密码重置成功');
      pwdForm.resetFields();
      setPwdModal({ open: false });
    } catch (err: any) {
      if (err?.message) message.error(err.message);
    }
  };

  const columns: any[] = [
    { title: '用户名', dataIndex: 'username', width: 140, render: (v: string) => v || <Text type="secondary">-</Text> },
    { title: '昵称', dataIndex: 'nickname', width: 140, render: (v: string) => v || <Text type="secondary">-</Text> },
    {
      title: '账号来源', dataIndex: 'source', width: 110,
      render: (v: string) => <Tag color={SOURCE_COLORS[v] || 'default'}>{SOURCE_LABELS[v] || v}</Tag>,
    },
    {
      title: '系统角色', dataIndex: 'role', width: 130,
      render: (role: string, r: any) => (
        <Select
          size="small"
          value={role}
          options={ROLE_OPTIONS}
          style={{ width: 110 }}
          onChange={(v) => handleRoleChange(r.id, v)}
        />
      ),
    },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: number, r: any) =>
        r.memberStatus === 'left' ? (
          <Tag color="red">已离开</Tag>
        ) : v === 1 ? (
          <Tag color="green">启用</Tag>
        ) : (
          <Tag>禁用</Tag>
        ),
    },
    {
      title: '最后登录', dataIndex: 'lastLoginAt', width: 140,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : <Text type="secondary">未登录</Text>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', width: 130,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作', key: 'actions', width: 220,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Popconfirm
            title={r.status === 1 ? '确认禁用该账号？' : '确认启用该账号？'}
            onConfirm={() => handleStatusToggle(r)}
            disabled={r.memberStatus === 'left'}
          >
            <Button size="small" type="link" disabled={r.memberStatus === 'left'}>
              {r.status === 1 ? '禁用' : '启用'}
            </Button>
          </Popconfirm>
          {r.source === 'manual' && (
            <Button
              size="small"
              type="link"
              icon={<KeyOutlined />}
              onClick={() => {
                pwdForm.resetFields();
                setPwdModal({ open: true, member: r });
              }}
            >
              重置密码
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>登录账号</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>
            手动创建账号
          </Button>
        </Space>
      </div>

      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索用户名/昵称/KOOK ID"
            prefix={<SearchOutlined />}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onPressEnter={() => { setPage(1); fetchList(1); }}
            style={{ width: 240 }}
          />
          <Select
            value={source}
            options={SOURCE_OPTIONS}
            style={{ width: 140 }}
            onChange={(v) => { setSource(v); setPage(1); }}
          />
          <Button type="primary" onClick={() => { setPage(1); fetchList(1); }}>查询</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => { setPage(p); fetchList(p); },
          }}
        />
      </Card>

      {/* 创建账号 */}
      <Modal
        title="手动创建登录账号"
        open={createModal}
        onCancel={() => { setCreateModal(false); createForm.resetFields(); }}
        onOk={handleCreate}
        okButtonProps={{ loading: createSubmitting }}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" preserve={false}>
          <Form.Item
            label="用户名（登录使用）"
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, max: 50, message: '长度 3-50' },
              { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅支持字母数字下划线连字符' },
            ]}
          >
            <Input placeholder="例如 admin01" autoComplete="off" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, max: 50, message: '长度 6-50' },
            ]}
          >
            <Input.Password placeholder="6-50 位" autoComplete="new-password" />
          </Form.Item>
          <Form.Item label="昵称（可选）" name="nickname">
            <Input placeholder="不填则与用户名相同" />
          </Form.Item>
          <Form.Item
            label="系统角色"
            name="role"
            initialValue="normal"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select options={ROLE_OPTIONS} />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            * 手动账号不绑定 KOOK/Albion，不计入"公会成员总数"
          </Text>
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={`重置密码 - ${pwdModal.member?.username || ''}`}
        open={pwdModal.open}
        onCancel={() => { setPwdModal({ open: false }); pwdForm.resetFields(); }}
        onOk={handleResetPassword}
        destroyOnClose
      >
        <Form form={pwdForm} layout="vertical" preserve={false}>
          <Form.Item
            label="新密码"
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, max: 50, message: '长度 6-50' },
            ]}
          >
            <Input.Password placeholder="6-50 位" autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

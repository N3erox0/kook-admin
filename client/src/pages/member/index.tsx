import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title } = Typography;

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

export default function MemberPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const isSuperAdmin = currentGuildRole === 'super_admin';

  const fetchData = () => {
    if (!currentGuildId) return;
    setLoading(true);
    const params: any = { page, pageSize: 50 };
    if (keyword) params.keyword = keyword;
    if (statusFilter) params.status = statusFilter;
    request.get(`/guild/${currentGuildId}/members`, { params }).then((res: any) => {
      setData(res.list || []);
      setTotal(res.total || 0);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [currentGuildId, page, statusFilter]);

  const handleRoleChange = async (memberId: number, role: string) => {
    try {
      await request.put(`/guild/${currentGuildId}/members/${memberId}/role`, { role });
      message.success('角色修改成功');
      fetchData();
    } catch {}
  };

  const calcDays = (joinedAt: string) => {
    if (!joinedAt) return '-';
    return dayjs().diff(dayjs(joinedAt), 'day');
  };

  const columns: any[] = [
    {
      title: '成员昵称', dataIndex: 'nickname', key: 'nickname', width: 160,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => v === 'active'
        ? <Tag color="green">在会</Tag>
        : <Tag color="red">离开</Tag>,
    },
    {
      title: '服务器角色', dataIndex: 'kookRoles', key: 'kookRoles', width: 200,
      render: (roles: any[]) => {
        if (!roles || !Array.isArray(roles) || roles.length === 0) return <Tag>无</Tag>;
        return (
          <Space size={2} wrap>
            {roles.slice(0, 3).map((r: any, i: number) => (
              <Tag key={i} color="processing">{typeof r === 'object' ? r.name : r}</Tag>
            ))}
            {roles.length > 3 && <Tag>+{roles.length - 3}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '系统角色', dataIndex: 'role', key: 'role', width: 150,
      render: (role: string, record: any) => {
        if (isSuperAdmin && record.status === 'active') {
          return (
            <Select
              value={role}
              size="small"
              style={{ width: 130 }}
              options={ROLE_OPTIONS}
              onChange={(v) => handleRoleChange(record.id, v)}
            />
          );
        }
        return <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role] || role}</Tag>;
      },
    },
    {
      title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '在会天数', key: 'days', width: 90,
      render: (_: any, record: any) => {
        if (record.status !== 'active') return '-';
        return `${calcDays(record.joinedAt)} 天`;
      },
    },
    {
      title: '离开时间', dataIndex: 'leftAt', key: 'leftAt', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '加入方式', dataIndex: 'joinSource', key: 'joinSource', width: 100,
      render: (v: string) => {
        const labels: Record<string, { text: string; color: string }> = {
          kook_sync: { text: '自动同步', color: 'blue' },
          invite_link: { text: '邀请链接', color: 'green' },
          manual: { text: '手动录入', color: 'orange' },
          webhook: { text: 'Webhook', color: 'purple' },
        };
        const item = labels[v] || { text: v || '-', color: 'default' };
        return <Tag color={item.color}>{item.text}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Title level={4}>成员管理</Title>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder="搜索昵称"
            allowClear
            style={{ width: 200 }}
            onSearch={(v) => { setKeyword(v); setPage(1); fetchData(); }}
          />
          <Select
            placeholder="状态筛选"
            allowClear
            style={{ width: 120 }}
            value={statusFilter || undefined}
            onChange={(v) => { setStatusFilter(v || ''); setPage(1); }}
            options={[
              { value: 'active', label: '在会' },
              { value: 'left', label: '离开' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{
            current: page,
            total,
            pageSize: 50,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => setPage(p),
          }}
        />
      </Card>
    </div>
  );
}

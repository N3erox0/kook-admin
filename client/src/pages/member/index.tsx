import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, message } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { ROLE_LABELS } from '@/types';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title } = Typography;

const STATUS_COLORS: Record<string, string> = { active: 'green', left: 'default' };

export default function MemberPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>('active');

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await request.get(`/guild/${guildId}/members`, {
        params: { page: p, pageSize: 50, keyword: keyword || undefined, status: statusFilter },
      });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(1); setPage(1); }, [guildId, statusFilter]);

  const handleSearch = () => { setPage(1); fetchList(1); };

  const handleRoleChange = async (memberId: number, role: string) => {
    try {
      await request.put(`/guild/${guildId}/members/${memberId}/role`, { role });
      message.success('角色已更新');
      fetchList();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '昵称', dataIndex: 'nickname', key: 'nick', ellipsis: true },
    { title: 'KOOK ID', dataIndex: 'kookUserId', key: 'kookId', width: 130, ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{v === 'active' ? '在会' : '已离开'}</Tag>,
    },
    {
      title: '角色', key: 'role', width: 160,
      render: (_: any, r: any) => (
        <Select size="small" value={r.role} style={{ width: 140 }}
          onChange={(v) => handleRoleChange(r.id, v)} disabled={r.status !== 'active'}>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <Select.Option key={k} value={k}>{v}</Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '加入时间', dataIndex: 'joinedAt', key: 'joined', width: 140,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '离开时间', dataIndex: 'leftAt', key: 'left', width: 140,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '最后同步', dataIndex: 'lastSyncedAt', key: 'sync', width: 140,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>成员管理</Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Input placeholder="搜索昵称/KOOK ID" prefix={<SearchOutlined />} allowClear
            value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={handleSearch} style={{ width: 200 }} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 100 }} allowClear placeholder="状态">
            <Select.Option value="active">在会</Select.Option>
            <Select.Option value="left">已离开</Select.Option>
          </Select>
          <Button type="primary" onClick={handleSearch}>查询</Button>
        </Space>
      </Card>

      <Card>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="middle"
          pagination={{ current: page, total, pageSize: 50, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }} />
      </Card>
    </div>
  );
}

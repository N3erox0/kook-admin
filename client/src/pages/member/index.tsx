import { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, message, Tooltip, Popover } from 'antd';
import { EyeOutlined, ClockCircleOutlined, SearchOutlined } from '@ant-design/icons';
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

export default function MemberPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  // F-101: 拆出受控输入与已提交查询参数，点击【查询】才触发
  const [keywordInput, setKeywordInput] = useState('');
  const [statusInput, setStatusInput] = useState<string>('');
  const [kookRoleIdInput, setKookRoleIdInput] = useState<string>('');
  const [queryParams, setQueryParams] = useState<{ keyword?: string; status?: string; kookRoleId?: string }>({});

  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<number | null>(null);

  const isSuperAdmin = currentGuildRole === 'super_admin';

  const fetchData = () => {
    if (!currentGuildId) return;
    setLoading(true);
    const params: any = { page, pageSize: 50 };
    if (queryParams.keyword) params.keyword = queryParams.keyword;
    if (queryParams.status) params.status = queryParams.status;
    if (queryParams.kookRoleId) params.kookRoleId = queryParams.kookRoleId;
    request.get(`/guild/${currentGuildId}/members`, { params }).then((res: any) => {
      setData(res.list || []);
      setTotal(res.total || 0);
    }).finally(() => setLoading(false));

    // 获取上次同步时间
    request.get(`/guild/${currentGuildId}/dashboard/overview`).then((res: any) => {
      setLastSyncedAt(res?.lastSyncedAt || null);
    }).catch(() => {});
  };

  useEffect(() => { fetchData(); }, [currentGuildId, page, queryParams]);

  // F-101: 从当前成员列表汇总出现过的 KOOK 角色作为下拉选项（避免额外调 KOOK API）
  const kookRoleOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of data) {
      const roles = Array.isArray(m.kookRoles) ? m.kookRoles : [];
      for (const r of roles) {
        if (r && typeof r === 'object' && r.role_id) {
          map.set(String(r.role_id), r.name || `角色${r.role_id}`);
        }
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ value: id, label: name }));
  }, [data]);

  const handleSearch = () => {
    setPage(1);
    setQueryParams({
      keyword: keywordInput.trim() || undefined,
      status: statusInput || undefined,
      kookRoleId: kookRoleIdInput || undefined,
    });
  };

  const handleResetSearch = () => {
    setKeywordInput('');
    setStatusInput('');
    setKookRoleIdInput('');
    setPage(1);
    setQueryParams({});
  };

  const handleRoleChange = async (memberId: number, role: string) => {
    try {
      await request.put(`/guild/${currentGuildId}/members/${memberId}/role`, { role });
      message.success('角色修改成功');
      setExpandedRoleId(null);
      fetchData();
    } catch (err: any) {
      message.error(err?.message || '角色修改失败');
    }
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
              <Tag key={i} color="processing">{typeof r === 'object' ? r.name : `角色${r}`}</Tag>
            ))}
            {roles.length > 3 && <Tag>+{roles.length - 3}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '系统角色', dataIndex: 'role', key: 'role', width: 120,
      render: (role: string) => <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role] || role}</Tag>,
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
    ...(isSuperAdmin ? [{
      title: '操作', key: 'actions', width: 80, fixed: 'right' as const,
      render: (_: any, record: any) => {
        if (record.status !== 'active') return null;
        return (
          <Popover
            trigger="click"
            open={expandedRoleId === record.id}
            onOpenChange={(open) => setExpandedRoleId(open ? record.id : null)}
            content={
              <Space direction="vertical" size="small">
                <Text strong style={{ fontSize: 12 }}>修改系统角色</Text>
                {ROLE_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    size="small"
                    type={record.role === opt.value ? 'primary' : 'default'}
                    block
                    onClick={() => handleRoleChange(record.id, opt.value)}
                    disabled={record.role === opt.value}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Space>
            }
          >
            <Tooltip title="修改角色">
              <Button size="small" type="link" icon={<EyeOutlined />} />
            </Tooltip>
          </Popover>
        );
      },
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>成员管理</Title>
        <Space>
          <ClockCircleOutlined style={{ color: '#999' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            上次同步：{lastSyncedAt ? dayjs(lastSyncedAt).format('YYYY-MM-DD HH:mm:ss') : '尚未同步'}
          </Text>
        </Space>
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input
            placeholder="搜索昵称/KOOK ID"
            allowClear
            style={{ width: 200 }}
            prefix={<SearchOutlined />}
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            onPressEnter={handleSearch}
          />
          <Select
            placeholder="KOOK 角色"
            allowClear
            style={{ width: 180 }}
            value={kookRoleIdInput || undefined}
            onChange={(v) => setKookRoleIdInput(v || '')}
            options={kookRoleOptions}
            showSearch
            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
          />
          <Select
            placeholder="状态"
            allowClear
            style={{ width: 120 }}
            value={statusInput || undefined}
            onChange={(v) => setStatusInput(v || '')}
            options={[
              { value: 'active', label: '在会' },
              { value: 'left', label: '离开' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
          <Button onClick={handleResetSearch}>重置</Button>
        </Space>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 900 }}
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

import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Input, Select, message, Tooltip, Popover, Modal, AutoComplete } from 'antd';
import { EyeOutlined, ClockCircleOutlined, SearchOutlined, SyncOutlined, LinkOutlined } from '@ant-design/icons';
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

/**
 * V3.2 成员列表页（精简版）
 * - 隐藏 KOOK 成员 Tab，仅显示公会成员（Albion）
 * - KOOK 数据后端保留（绑定弹窗仍依赖）
 * - 系统账号管理已独立到 /admin/accounts
 */
export default function MemberPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keywordInput, setKeywordInput] = useState('');
  const [statusInput, setStatusInput] = useState<string>('');
  const [queryParams, setQueryParams] = useState<{ keyword?: string; status?: string }>({});
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<number | null>(null);
  const [bindingModal, setBindingModal] = useState(false);
  const [bindingTarget, setBindingTarget] = useState<any>(null);
  const [kookOptions, setKookOptions] = useState<any[]>([]);
  const [selectedKookMemberId, setSelectedKookMemberId] = useState<number | null>(null);

  const isSuperAdmin = currentGuildRole === 'super_admin';
  const canManage = currentGuildRole === 'super_admin' || currentGuildRole === 'inventory_admin';

  const fetchData = () => {
    if (!currentGuildId) return;
    setLoading(true);
    const params: any = { page, pageSize: 50 };
    if (queryParams.keyword) params.keyword = queryParams.keyword;
    if (queryParams.status) params.status = queryParams.status;
    request.get(`/guild/${currentGuildId}/members/albion`, { params }).then((res: any) => {
      setData(res.list || []);
      setTotal(res.total || 0);
    }).finally(() => setLoading(false));

    request.get(`/guild/${currentGuildId}/dashboard/overview`).then((res: any) => {
      setLastSyncedAt(res?.lastSyncedAt || null);
    }).catch(() => {});
  };

  useEffect(() => { fetchData(); }, [currentGuildId, page, queryParams]);

  const handleSearch = () => {
    setPage(1);
    setQueryParams({ keyword: keywordInput.trim() || undefined, status: statusInput || undefined });
  };

  const handleResetSearch = () => {
    setKeywordInput(''); setStatusInput(''); setPage(1); setQueryParams({});
  };

  const handleRoleChange = async (memberId: number, role: string) => {
    try {
      await request.put(`/guild/${currentGuildId}/members/${memberId}/role`, { role });
      message.success('角色修改成功');
      setExpandedRoleId(null);
      fetchData();
    } catch (err: any) { message.error(err?.message || '角色修改失败'); }
  };

  const handleSyncAlbion = async () => {
    if (!currentGuildId) return;
    setLoading(true);
    try {
      const res: any = await request.post(`/guild/${currentGuildId}/members/albion/sync`);
      message.success(`Albion成员同步完成：新增${res.added} 更新${res.updated} 离开${res.left} 自动绑定${res.autoBound}`);
      fetchData();
    } catch (err: any) { message.error(err?.message || '同步失败'); }
    finally { setLoading(false); }
  };

  const searchKookMembers = async (keyword: string) => {
    if (!currentGuildId) return;
    const res: any = await request.get(`/guild/${currentGuildId}/members/kook/search`, { params: { keyword } });
    setKookOptions((res || []).map((m: any) => ({ value: m.nickname || m.kookUserId, label: `${m.nickname || '-'} (${m.kookUserId})`, item: m })));
  };

  const openBindModal = (record: any) => {
    setBindingTarget(record);
    setSelectedKookMemberId(null);
    setKookOptions([]);
    setBindingModal(true);
  };

  const handleBind = async () => {
    if (!bindingTarget || !selectedKookMemberId || !currentGuildId) return;
    await request.post(`/guild/${currentGuildId}/members/albion/${bindingTarget.playerId}/bind`, { guildMemberId: selectedKookMemberId });
    message.success('绑定成功');
    setBindingModal(false);
    fetchData();
  };

  const calcDays = (joinedAt: string) => joinedAt ? dayjs().diff(dayjs(joinedAt), 'day') : '-';

  const albionColumns: any[] = [
    { title: 'Albion玩家名', dataIndex: 'playerName', key: 'playerName', width: 170 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: string) => v === 'active' ? <Tag color="green">在会</Tag> : <Tag color="red">离开</Tag> },
    { title: 'KOOK 昵称', dataIndex: 'kookNickname', key: 'kookNickname', width: 160, render: (v: string) => v || <Text type="secondary">未绑定</Text> },
    { title: '系统角色', dataIndex: 'role', key: 'role', width: 130, render: (role: string) => role ? <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role] || role}</Tag> : <Text type="secondary">-</Text> },
    { title: '在公会天数', key: 'days', width: 100, render: (_: any, record: any) => record.status !== 'active' ? '-' : `${calcDays(record.joinedAt)} 天` },
    { title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '离开时间', dataIndex: 'leftAt', key: 'leftAt', width: 110, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    ...(canManage ? [{
      title: '操作', key: 'actions', width: 160, render: (_: any, record: any) => (
        <Space size={4}>
          <Button size="small" type="link" icon={<LinkOutlined />} onClick={() => openBindModal(record)}>绑定</Button>
          {isSuperAdmin && record.guildMemberId ? (
            <Popover trigger="click" open={expandedRoleId === record.guildMemberId} onOpenChange={(open) => setExpandedRoleId(open ? record.guildMemberId : null)} content={
              <Space direction="vertical" size="small">
                <Text strong style={{ fontSize: 12 }}>修改系统角色</Text>
                {ROLE_OPTIONS.map(opt => (
                  <Button key={opt.value} size="small" type={record.role === opt.value ? 'primary' : 'default'} block onClick={() => handleRoleChange(record.guildMemberId, opt.value)} disabled={record.role === opt.value}>{opt.label}</Button>
                ))}
              </Space>
            }>
              <Tooltip title="修改角色"><Button size="small" type="link" icon={<EyeOutlined />} /></Tooltip>
            </Popover>
          ) : null}
        </Space>
      )
    }] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>公会成员</Title>
        <Space>
          <ClockCircleOutlined style={{ color: '#999' }} />
          <Text type="secondary" style={{ fontSize: 12 }}>上次KOOK同步：{lastSyncedAt ? dayjs(lastSyncedAt).format('YYYY-MM-DD HH:mm:ss') : '尚未同步'}</Text>
          {canManage && <Button icon={<SyncOutlined />} onClick={handleSyncAlbion} loading={loading}>同步 Albion 成员</Button>}
        </Space>
      </div>
      <Card>
        <Space style={{ marginBottom: 16 }} wrap>
          <Input placeholder="搜索玩家名/Player ID" allowClear style={{ width: 220 }} prefix={<SearchOutlined />} value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} onPressEnter={handleSearch} />
          <Select placeholder="状态" allowClear style={{ width: 120 }} value={statusInput || undefined} onChange={(v) => setStatusInput(v || '')} options={[{ value: 'active', label: '在会' }, { value: 'left', label: '离开' }]} />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
          <Button onClick={handleResetSearch}>重置</Button>
        </Space>
        <Table columns={albionColumns} dataSource={data} rowKey="id" loading={loading} size="small" scroll={{ x: 1100 }} pagination={{ current: page, total, pageSize: 50, showTotal: (t) => `共 ${t} 条`, onChange: (p) => setPage(p) }} />
      </Card>

      <Modal title={`绑定 KOOK 成员 - ${bindingTarget?.playerName || ''}`} open={bindingModal} onCancel={() => setBindingModal(false)} onOk={handleBind} okButtonProps={{ disabled: !selectedKookMemberId }}>
        <Text type="secondary">如果 Albion 玩家名和 KOOK 昵称不完全一致，请搜索并选择正确的 KOOK 成员。</Text>
        <AutoComplete style={{ width: '100%', marginTop: 16 }} placeholder="搜索 KOOK 昵称" options={kookOptions} onSearch={searchKookMembers} onSelect={(_: string, option: any) => setSelectedKookMemberId(option.item.id)} />
      </Modal>
    </div>
  );
}

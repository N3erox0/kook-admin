import { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, Input, Typography, message, Popconfirm, Tooltip, Select, Drawer } from 'antd';
import { PlusOutlined, CopyOutlined, ReloadOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { getAllInviteCodes, generateInviteCodes, updateInviteCodeStatus } from '@/api/guild';
import { useNavigate } from 'react-router-dom';
import type { InviteCode } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  disabled: { label: '未启用', color: 'default' },
  enabled: { label: '已启用', color: 'green' },
  used: { label: '已使用', color: 'blue' },
  revoked: { label: '无效', color: 'red' },
};

const SOURCE_MAP: Record<string, { label: string; color: string }> = {
  '01': { label: '系统手动', color: 'cyan' },
  '02': { label: 'BOT自动', color: 'purple' },
};

export default function InviteCodePage() {
  const navigate = useNavigate();
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detailItem, setDetailItem] = useState<InviteCode | null>(null);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res: any = await getAllInviteCodes();
      const list = res || [];
      setCodes(list);
      applyFilter(list, statusFilter);
    } catch {} finally { setLoading(false); }
  };

  const applyFilter = (list: InviteCode[], status?: string) => {
    if (!status) setFilteredCodes(list);
    else setFilteredCodes(list.filter(c => c.status === status));
  };

  useEffect(() => { fetchCodes(); }, []);
  useEffect(() => { applyFilter(codes, statusFilter); }, [statusFilter, codes]);

  const handleGenerate = async () => {
    setGenerateLoading(true);
    try {
      await generateInviteCodes({ count: 1 });
      message.success('邀请码已生成');
      fetchCodes();
    } catch {} finally { setGenerateLoading(false); }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateInviteCodeStatus(id, status);
      message.success('状态更新成功');
      fetchCodes();
    } catch (err: any) {
      message.error(err?.message || '状态更新失败');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => message.success('已复制'));
  };

  const openDetail = (record: InviteCode) => {
    setDetailItem(record);
    setDetailDrawer(true);
  };

  const columns = [
    {
      title: '邀请码', dataIndex: 'code', key: 'code', width: 180,
      render: (code: string) => (
        <Space>
          <code style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1 }}>{code}</code>
          <Tooltip title="复制">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyCode(code)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (status: string) => {
        const info = STATUS_MAP[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '创建途径', dataIndex: 'createSource', key: 'source', width: 100,
      render: (v: string) => {
        const info = SOURCE_MAP[v] || { label: v || '未知', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '绑定公会', dataIndex: 'boundGuildName', key: 'guild', width: 140,
      render: (name: string | null) => name ? <Text strong>{name}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 150,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '使用时间', dataIndex: 'usedAt', key: 'usedAt', width: 150,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作', key: 'actions', width: 160, fixed: 'right' as const,
      render: (_: any, record: InviteCode) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(record)}>详情</Button>
          {record.status !== 'used' && record.status !== 'revoked' && (
            <Popconfirm title="确认标记为无效？无效后不可恢复" onConfirm={() => handleStatusChange(record.id, 'revoked')}>
              <Button size="small" type="link" danger>标记无效</Button>
            </Popconfirm>
          )}
          {record.status === 'disabled' && (
            <Popconfirm title="确认启用此邀请码？" onConfirm={() => handleStatusChange(record.id, 'enabled')}>
              <Button size="small" type="link">启用</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>邀请码管理</Title>
        <Space>
          <Select placeholder="状态筛选" allowClear style={{ width: 130 }} value={statusFilter}
            onChange={v => setStatusFilter(v)}>
            {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={fetchCodes}>刷新</Button>
          <Popconfirm title="确认生成一个新的12位邀请码？" onConfirm={handleGenerate}>
            <Button type="primary" icon={<PlusOutlined />} loading={generateLoading}>生成邀请码</Button>
          </Popconfirm>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={filteredCodes}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 详情 Drawer */}
      <Drawer title="邀请码详情" open={detailDrawer} onClose={() => setDetailDrawer(false)} width={420}>
        {detailItem && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div><Text strong>邀请码：</Text><code style={{ fontSize: 16, fontWeight: 600 }}>{detailItem.code}</code></div>
            <div><Text strong>状态：</Text><Tag color={STATUS_MAP[detailItem.status]?.color}>{STATUS_MAP[detailItem.status]?.label || detailItem.status}</Tag></div>
            <div><Text strong>创建途径：</Text><Tag color={SOURCE_MAP[(detailItem as any).createSource]?.color}>{SOURCE_MAP[(detailItem as any).createSource]?.label || '未知'}</Tag></div>
            <div><Text strong>创建时间：</Text>{dayjs(detailItem.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
            {detailItem.usedAt && <div><Text strong>使用时间：</Text>{dayjs(detailItem.usedAt).format('YYYY-MM-DD HH:mm:ss')}</div>}
            {detailItem.remark && <div><Text strong>备注：</Text>{detailItem.remark}</div>}

            {detailItem.status === 'used' && detailItem.boundGuildName && (
              <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                <div><Text strong>已绑定公会：</Text><Text>{detailItem.boundGuildName}</Text></div>
                {detailItem.boundGuildId && (
                  <Button type="link" icon={<LinkOutlined />} style={{ padding: 0, marginTop: 8 }}
                    onClick={() => { setDetailDrawer(false); navigate('/admin/dashboard'); }}>
                    查看该公会详情
                  </Button>
                )}
              </Card>
            )}
          </Space>
        )}
      </Drawer>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Drawer, Timeline, Image, DatePicker } from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined, SendOutlined, EyeOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { getResupplyList, getResupplyDetail, createResupply, processResupply, batchProcessResupply } from '@/api/resupply';
import { useGuildStore } from '@/stores/guild.store';
import { RESUPPLY_STATUS } from '@/types';
import type { GuildResupply } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_COLORS: Record<number, string> = { 0: 'orange', 1: 'green', 2: 'red', 3: 'cyan' };

export default function ResupplyPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const guildId = currentGuildId!;
  const canProcess = ['super_admin', 'resupply_staff'].includes(currentGuildRole || '');

  const [list, setList] = useState<GuildResupply[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 详情
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 新建
  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();

  // 驳回原因
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 20, status: statusFilter, keyword: keyword || undefined };
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const res: any = await getResupplyList(guildId, params);
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(1); setPage(1); }, [guildId, statusFilter]);

  const handleSearch = () => { setPage(1); fetchList(1); };

  const openDetail = async (id: number) => {
    setDetailDrawer(true);
    setDetailLoading(true);
    try {
      const res: any = await getResupplyDetail(guildId, id);
      setDetail(res);
    } catch {} finally { setDetailLoading(false); }
  };

  const handleProcess = async (id: number, action: string, remark?: string) => {
    try {
      await processResupply(guildId, id, { action, remark });
      message.success(action === 'approve' ? '已通过（库存-1）' : action === 'reject' ? '已驳回' : '已标记发放');
      fetchList();
      if (detail?.id === id) openDetail(id);
    } catch {}
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) { message.warning('请填写驳回原因'); return; }
    await handleProcess(rejectTarget, 'reject', rejectReason);
    setRejectModal(false);
    setRejectReason('');
    setRejectTarget(null);
  };

  const handleBatchProcess = async (action: string) => {
    if (selectedIds.length === 0) { message.warning('请先选择记录'); return; }
    try {
      const res: any = await batchProcessResupply(guildId, { ids: selectedIds, action });
      message.success(`批量操作完成: ${res.processed} 条`);
      setSelectedIds([]);
      fetchList();
    } catch {}
  };

  const handleCreate = async (values: any) => {
    try {
      await createResupply(guildId, { ...values, quantity: values.quantity || 1 });
      message.success('创建成功');
      setCreateModal(false);
      createForm.resetFields();
      fetchList();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: number) => <Tag color={STATUS_COLORS[s]}>{RESUPPLY_STATUS[s]}</Tag>,
    },
    { title: '申请人', dataIndex: 'kookNickname', key: 'nick', width: 120, ellipsis: true },
    { title: '装备', dataIndex: 'equipmentName', key: 'equip', ellipsis: true },
    {
      title: '装等', key: 'gs', width: 60,
      render: (_: any, r: GuildResupply) => r.gearScore ? <Tag>P{r.gearScore}</Tag> : '-',
    },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 60 },
    { title: '类型', dataIndex: 'applyType', key: 'type', width: 70 },
    {
      title: '截图', key: 'screenshot', width: 60,
      render: (_: any, r: GuildResupply) => r.screenshotUrl ? <Image src={r.screenshotUrl} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} /> : '-',
    },
    {
      title: '时间', dataIndex: 'createdAt', key: 'time', width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 220, fixed: 'right' as const,
      render: (_: any, r: GuildResupply) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
          {canProcess && r.status === 0 && (
            <>
              <Popconfirm title="确认通过？通过后自动扣减库存-1" onConfirm={() => handleProcess(r.id, 'approve')}>
                <Button size="small" type="link" style={{ color: '#52c41a' }} icon={<CheckOutlined />}>通过</Button>
              </Popconfirm>
              <Button size="small" type="link" danger icon={<CloseOutlined />}
                onClick={() => { setRejectTarget(r.id); setRejectModal(true); }}>驳回</Button>
            </>
          )}
          {canProcess && r.status === 1 && (
            <Popconfirm title="标记为已发放？" onConfirm={() => handleProcess(r.id, 'dispatch')}>
              <Button size="small" type="link" icon={<SendOutlined />}>发放</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>补装管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          {canProcess && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>手动创建</Button>}
        </Space>
      </div>

      {/* 筛选栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input placeholder="搜索装备/申请人" prefix={<SearchOutlined />} allowClear
            value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={handleSearch} style={{ width: 200 }} />
          <Select placeholder="状态" allowClear style={{ width: 120 }} value={statusFilter}
            onChange={v => setStatusFilter(v)}>
            {Object.entries(RESUPPLY_STATUS).map(([k, v]) => <Select.Option key={k} value={Number(k)}>{v}</Select.Option>)}
          </Select>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as any)}
            style={{ width: 240 }}
          />
          <Button type="primary" onClick={handleSearch}>查询</Button>
          {canProcess && selectedIds.length > 0 && (
            <>
              <Popconfirm title={`批量通过 ${selectedIds.length} 条？`} onConfirm={() => handleBatchProcess('approve')}>
                <Button type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}>批量通过 ({selectedIds.length})</Button>
              </Popconfirm>
            </>
          )}
        </Space>
      </Card>

      <Card>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="middle" scroll={{ x: 1000 }}
          rowSelection={canProcess ? { selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]),
            getCheckboxProps: (r: GuildResupply) => ({ disabled: r.status !== 0 }),
          } : undefined}
          pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }}
        />
      </Card>

      {/* 详情 Drawer */}
      <Drawer title="补装申请详情" open={detailDrawer} onClose={() => setDetailDrawer(false)} width={520}>
        {detailLoading ? <Text>加载中...</Text> : detail && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div><Text strong>状态：</Text><Tag color={STATUS_COLORS[detail.status]}>{RESUPPLY_STATUS[detail.status]}</Tag></div>
                <div><Text strong>申请人：</Text>{detail.kookNickname || '-'} ({detail.kookUserId || '-'})</div>
                <div><Text strong>装备：</Text>{detail.equipmentName} {detail.gearScore ? `P${detail.gearScore}` : ''}</div>
                <div><Text strong>数量：</Text>{detail.quantity} | <Text strong>类型：</Text>{detail.applyType}</div>
                {detail.reason && <div><Text strong>原因/来源：</Text>{detail.reason}</div>}
                {detail.processRemark && <div><Text strong>处理备注：</Text>{detail.processRemark}</div>}
                <div><Text strong>申请时间：</Text>{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                {detail.processedAt && <div><Text strong>处理时间：</Text>{dayjs(detail.processedAt).format('YYYY-MM-DD HH:mm:ss')}</div>}
              </Space>
            </div>

            {detail.screenshotUrl && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>截图：</Text><br />
                <Image src={detail.screenshotUrl} width={200} style={{ borderRadius: 8, marginTop: 8 }} />
              </div>
            )}

            {/* 操作按钮 */}
            {canProcess && detail.status === 0 && (
              <Space style={{ marginBottom: 16 }}>
                <Popconfirm title="确认通过？" onConfirm={() => handleProcess(detail.id, 'approve')}>
                  <Button type="primary" icon={<CheckOutlined />}>通过</Button>
                </Popconfirm>
                <Button danger icon={<CloseOutlined />}
                  onClick={() => { setRejectTarget(detail.id); setRejectModal(true); }}>驳回</Button>
              </Space>
            )}
            {canProcess && detail.status === 1 && (
              <Popconfirm title="标记已发放？" onConfirm={() => handleProcess(detail.id, 'dispatch')}>
                <Button icon={<SendOutlined />}>标记发放</Button>
              </Popconfirm>
            )}

            {/* 流转日志 */}
            {detail.logs?.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <Text strong>流转日志</Text>
                <Timeline style={{ marginTop: 12 }}
                  items={detail.logs.map((log: any) => ({
                    color: log.action === 'approve' ? 'green' : log.action === 'reject' ? 'red' : 'blue',
                    children: (
                      <div key={log.id}>
                        <Text strong>{log.action}</Text>
                        <Text> {log.fromStatus} → {log.toStatus}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>{log.operatorName || '系统'} · {dayjs(log.createdAt).format('MM-DD HH:mm')}</Text>
                        {log.remark && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{log.remark}</Text></>}
                      </div>
                    ),
                  }))}
                />
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* 手动创建弹窗 */}
      <Modal title="手动创建补装申请" open={createModal} onCancel={() => setCreateModal(false)} footer={null} destroyOnClose>
        <Form form={createForm} onFinish={handleCreate} layout="vertical" initialValues={{ quantity: 1, applyType: '补装' }}>
          <Form.Item name="equipmentName" label="装备名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space>
            <Form.Item name="quantity" label="数量" rules={[{ required: true }]}><InputNumber min={1} /></Form.Item>
            <Form.Item name="applyType" label="类型">
              <Select style={{ width: 120 }}>
                <Select.Option value="补装">补装</Select.Option>
                <Select.Option value="OC碎">OC碎</Select.Option>
                <Select.Option value="其他">其他</Select.Option>
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="kookNickname" label="申请人昵称"><Input /></Form.Item>
          <Form.Item name="reason" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>创建</Button></Form.Item>
        </Form>
      </Modal>

      {/* 驳回原因弹窗 */}
      <Modal title="驳回原因" open={rejectModal} onCancel={() => { setRejectModal(false); setRejectReason(''); }}
        onOk={handleReject} okText="确认驳回" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} placeholder="请填写驳回原因（必填）"
          value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
      </Modal>
    </div>
  );
}

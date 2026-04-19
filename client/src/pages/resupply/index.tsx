import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Image, DatePicker, AutoComplete, Tabs } from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined, SendOutlined, EyeOutlined, PlusOutlined, SearchOutlined, OrderedListOutlined, HomeOutlined, MergeCellsOutlined, ExpandAltOutlined, DeleteOutlined, ScanOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { getResupplyList, getResupplyDetail, createResupply, processResupply, batchProcessResupply, batchAssignRoom, getGroupedResupply, getMergedResupply, quickCompleteResupply } from '@/api/resupply';
import { searchCatalog } from '@/api/catalog';
import { useGuildStore } from '@/stores/guild.store';
import { RESUPPLY_STATUS, formatEquipName } from '@/types';
import type { GuildResupply } from '@/types';
import dayjs from 'dayjs';
import PendingRecognitionTab from './PendingRecognitionTab';
import MatchPreview, { ConfirmedItem } from './components/MatchPreview';

const { Title, Text } = Typography;

const STATUS_COLORS: Record<number, string> = { 0: 'orange', 1: 'green', 2: 'red', 3: 'cyan' };

const RESUPPLY_ROOMS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14',
  '大厅一', '大厅二',
];

export default function ResupplyPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const guildId = currentGuildId!;
  const canProcess = ['super_admin', 'resupply_staff'].includes(currentGuildRole || '');

  const [searchParams, setSearchParams] = useSearchParams();
  // F-107: Tab 通过 URL 参数持久化（?tab=list | pending）
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'list');

  const [list, setList] = useState<GuildResupply[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<number | undefined>(undefined);
  const [keyword, setKeyword] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 合并视图
  const [mergedView, setMergedView] = useState(false);
  const [mergedList, setMergedList] = useState<any[]>([]);
  const [mergedTotal, setMergedTotal] = useState(0);
  const [mergedLoading, setMergedLoading] = useState(false);

  // 详情
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // F-109: 装备放大显示 Modal
  const [equipExpandModal, setEquipExpandModal] = useState(false);

  // V2.9.3: 图像识别预览 Modal
  const [matchPreviewModal, setMatchPreviewModal] = useState(false);

  // 新建
  const [createModal, setCreateModal] = useState(false);
  const [createForm] = Form.useForm();

  // 驳回原因
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // 需求4：房间分配弹窗
  const [roomModal, setRoomModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>('');

  // 需求4：装备聚合排序弹窗
  const [groupModal, setGroupModal] = useState(false);
  const [groupKeyword, setGroupKeyword] = useState('');
  const [groupList, setGroupList] = useState<GuildResupply[]>([]);
  const [groupLoading, setGroupLoading] = useState(false);

  // F-055/F-103: 手动创建装备列表（含数量）
  const [catalogOptions, setCatalogOptions] = useState<any[]>([]);
  const [createEquipList, setCreateEquipList] = useState<{ id: number; name: string; gearScore?: number; category?: string; quantity: number }[]>([]);
  const handleCatalogSearch = async (kw: string) => {
    if (!kw || kw.length < 1) { setCatalogOptions([]); return; }
    const cleanKw = kw.replace(/^\d+/, '').trim();
    if (!cleanKw) { setCatalogOptions([]); return; }
    try {
      const res: any = await searchCatalog(cleanKw);
      setCatalogOptions((res || []).map((item: any) => ({
        value: `${item.id}_${item.name}`,
        label: formatEquipName(item),
        item,
      })));
    } catch { setCatalogOptions([]); }
  };

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

  const fetchMergedList = async (p = page) => {
    if (!guildId) return;
    setMergedLoading(true);
    try {
      const params: any = { page: p, pageSize: 20, status: statusFilter, keyword: keyword || undefined };
      if (dateRange && dateRange[0] && dateRange[1]) {
        params.startDate = dateRange[0].format('YYYY-MM-DD');
        params.endDate = dateRange[1].format('YYYY-MM-DD');
      }
      const res: any = await getMergedResupply(guildId, params);
      setMergedList(res?.list || []);
      setMergedTotal(res?.total || 0);
    } catch {} finally { setMergedLoading(false); }
  };

  const handleSearch = () => {
    setPage(1);
    if (mergedView) fetchMergedList(1);
    else fetchList(1);
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    setSearchParams(key === 'list' ? {} : { tab: key }, { replace: true });
  };

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
      // F-103: 使用 equipmentEntries 带数量
      const equipmentEntries = createEquipList.map(e => ({ catalogId: e.id, quantity: e.quantity || 1 }));
      const totalQty = equipmentEntries.reduce((s, e) => s + (e.quantity || 1), 0);
      await createResupply(guildId, {
        ...values,
        equipmentEntries,
        quantity: totalQty,
      });
      message.success('创建成功');
      setCreateModal(false);
      createForm.resetFields();
      setCreateEquipList([]);
      fetchList();
    } catch {}
  };

  // V2.9.3：图像识别预览确认回调（快捷补装完成）
  const handleMatchConfirm = async (items: ConfirmedItem[]) => {
    if (!detail) return;
    if (items.length === 0) { message.warning('请至少勾选一件装备'); return; }
    try {
      const equipmentEntries = items.map(it => ({ catalogId: it.catalogId, quantity: it.quantity }));
      await quickCompleteResupply(guildId, detail.id, {
        equipmentEntries,
        remark: `图像识别确认：${items.map(i => `${i.name}×${i.quantity}`).join('、')}`,
      });
      message.success('已根据图像识别结果完成补装（库存已扣减）');
      setMatchPreviewModal(false);
      setDetailDrawer(false);
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '快捷完成失败');
    }
  };

  // 需求4A：批量分配房间
  const handleAssignRoom = async () => {
    if (!selectedRoom || selectedIds.length === 0) { message.warning('请选择房间'); return; }
    try {
      const res: any = await batchAssignRoom(guildId, { ids: selectedIds, room: selectedRoom });
      message.success(`已分配 ${res.updated} 条到房间 ${selectedRoom}`);
      setRoomModal(false);
      setSelectedRoom('');
      setSelectedIds([]);
      fetchList();
    } catch {}
  };

  // 需求4B：打开装备聚合排序视图
  const handleOpenGroupView = async (kw?: string) => {
    setGroupLoading(true);
    setGroupModal(true);
    try {
      const res: any = await getGroupedResupply(guildId, kw || groupKeyword || undefined);
      setGroupList(Array.isArray(res) ? res : []);
    } catch { setGroupList([]); } finally { setGroupLoading(false); }
  };

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: number) => <Tag color={STATUS_COLORS[s]}>{RESUPPLY_STATUS[s]}</Tag>,
    },
    { title: '申请人', dataIndex: 'kookNickname', key: 'nick', width: 120, ellipsis: true },
    {
      title: '补装房间', dataIndex: 'resupplyRoom', key: 'room', width: 80,
      render: (v: string) => v ? <Tag color="volcano">{v}</Tag> : '-',
    },
    {
      title: '补装箱子', dataIndex: 'resupplyBox', key: 'box', width: 80,
      render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-',
    },
    {
      title: '补装类型', dataIndex: 'applyType', key: 'type', width: 100,
      render: (v: string) => {
        const colors: Record<string, string> = { '死亡补装': 'red', 'REOC': 'orange', '手动创建': 'blue', '补装': 'red', 'OC碎': 'orange', '其他': 'default' };
        return <Tag color={colors[v] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '待补装备', key: 'equip', ellipsis: true,
      render: (_: any, r: any) => {
        if (r.equipmentNames) return <span>{r.equipmentNames}</span>;
        if (!r.equipmentIds) return '-';
        const ids = r.equipmentIds.split(',').filter(Boolean);
        return <span>{ids.length}件装备 (ID: {ids.slice(0, 3).join(',')}{ ids.length > 3 ? '...' : '' })</span>;
      },
    },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 55 },
    {
      title: 'KOOK时间', key: 'kookTime', width: 130,
      render: (_: any, r: any) => r.kookMessageTime ? dayjs(r.kookMessageTime).format('YYYY-MM-DD HH:mm') : dayjs(r.createdAt).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 200, fixed: 'right' as const,
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
          {activeTab === 'list' && (
            <>
              <Button icon={<ReloadOutlined />} onClick={() => mergedView ? fetchMergedList() : fetchList()}>刷新</Button>
              <Button
                icon={<MergeCellsOutlined />}
                type={mergedView ? 'primary' : 'default'}
                onClick={() => {
                  const next = !mergedView;
                  setMergedView(next);
                  if (next) fetchMergedList(1);
                }}
              >
                {mergedView ? '退出合并' : '合并视图'}
              </Button>
              {canProcess && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>手动创建</Button>}
            </>
          )}
        </Space>
      </div>

      {/* F-107: Tabs — 补装列表 / 待识别 */}
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'list',
            label: '补装列表',
            children: renderResupplyListTab(),
          },
          {
            key: 'pending',
            label: '待识别',
            children: <PendingRecognitionTab guildId={guildId} canProcess={canProcess} onRefresh={fetchList} />,
          },
        ]}
      />

      {/* 详情 Modal（居中弹窗） */}
      <Modal title="补装申请详情" open={detailDrawer} onCancel={() => setDetailDrawer(false)} width={600} footer={null} centered destroyOnClose>
        {detailLoading ? <Text>加载中...</Text> : detail && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div><Text strong>状态：</Text><Tag color={STATUS_COLORS[detail.status]}>{RESUPPLY_STATUS[detail.status]}</Tag></div>
                <div><Text strong>申请人：</Text>{detail.kookNickname || '-'}</div>
                <div>
                  <Text strong>待补装备：</Text>
                  {detail.equipmentNames || detail.equipmentName || <Text type="secondary">（暂无装备）</Text>}
                  {/* F-109: 放大按钮 */}
                  {(detail.equipmentNames || detail.equipmentDetails?.length > 0) && (
                    <Button size="small" type="link" icon={<ExpandAltOutlined />}
                      onClick={() => setEquipExpandModal(true)} style={{ marginLeft: 8 }}>
                      放大查看
                    </Button>
                  )}
                </div>
                <div><Text strong>数量：</Text>{detail.quantity} | <Text strong>类型：</Text>{detail.applyType}</div>
                {detail.resupplyBox && <div><Text strong>箱子编号：</Text><Tag color="geekblue">{detail.resupplyBox}</Tag></div>}
                {detail.resupplyRoom && <div><Text strong>补装房间：</Text><Tag color="volcano">{detail.resupplyRoom}</Tag></div>}
                {detail.killDate && <div><Text strong>击杀日期：</Text>{detail.killDate}</div>}
                {detail.mapName && <div><Text strong>地图：</Text>{detail.mapName}</div>}
                {detail.gameId && <div><Text strong>游戏ID：</Text>{detail.gameId}</div>}
                {detail.ocrGuildName && <div><Text strong>公会名(OCR)：</Text>{detail.ocrGuildName}</div>}
                {detail.reason && <div><Text strong>原因/来源：</Text>{detail.reason}</div>}
                {detail.processRemark && <div><Text strong>处理备注：</Text>{detail.processRemark}</div>}
                <div><Text strong>申请时间：</Text>{dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}</div>
                {detail.processedAt && <div><Text strong>处理时间：</Text>{dayjs(detail.processedAt).format('YYYY-MM-DD HH:mm:ss')}</div>}
              </Space>
            </div>
            {detail.screenshotUrl && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>截图：</Text>
                {canProcess && (
                  <Button size="small" type="link" icon={<ScanOutlined />}
                    onClick={() => setMatchPreviewModal(true)} style={{ marginLeft: 8 }}>
                    图像识别预览
                  </Button>
                )}
                <br />
                <Image src={detail.screenshotUrl} width={200} style={{ borderRadius: 8, marginTop: 8 }} />
              </div>
            )}
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
          </div>
        )}
      </Modal>

      {/* F-109: 装备放大显示 Modal */}
      <Modal title={`待补装备完整列表（${detail?.equipmentDetails?.length || 0} 件）`}
        open={equipExpandModal}
        onCancel={() => setEquipExpandModal(false)}
        width={900}
        footer={<Button onClick={() => setEquipExpandModal(false)}>关闭</Button>}
        centered
      >
        {detail?.equipmentDetails?.length > 0 ? (
          <Table
            dataSource={detail.equipmentDetails}
            rowKey={(_: any, i: any) => `eq-${i}`}
            size="middle"
            pagination={false}
            scroll={{ y: 500 }}
            columns={[
              { title: '#', key: 'idx', width: 50, render: (_: any, __: any, i: number) => i + 1 },
              { title: '装备名称', dataIndex: 'name', key: 'name' },
              { title: '等级', dataIndex: 'level', key: 'lv', width: 60 },
              { title: '品质', dataIndex: 'quality', key: 'q', width: 60 },
              { title: '装等', key: 'gs', width: 70, render: (_: any, r: any) => r.gearScore ? `P${r.gearScore}` : '-' },
              { title: '部位', dataIndex: 'category', key: 'cat', width: 80 },
            ]}
          />
        ) : (
          <Text type="secondary">无装备详情</Text>
        )}
      </Modal>

      {/* V2.9.3: 图像识别预览 Modal */}
      <Modal
        title={<Space><ScanOutlined /><span>图像识别预览 - 补装申请 #{detail?.id}</span></Space>}
        open={matchPreviewModal}
        onCancel={() => setMatchPreviewModal(false)}
        width={1100}
        footer={null}
        centered
        destroyOnClose
      >
        {detail?.screenshotUrl && (
          <MatchPreview
            guildId={guildId}
            resupplyId={detail.id}
            onConfirm={handleMatchConfirm}
            confirmText="确认并快捷补装完成"
          />
        )}
      </Modal>

      {/* 手动创建弹窗 - 多装备列表模式 + F-103 数量 */}
      <Modal title="手动创建补装申请" open={createModal} width={720}
        onCancel={() => { setCreateModal(false); setCatalogOptions([]); setCreateEquipList([]); }}
        footer={null} destroyOnClose>
        <Form form={createForm} onFinish={handleCreate} layout="vertical" initialValues={{ applyType: '手动创建' }}>

          {/* 装备搜索+添加 */}
          <Form.Item label="搜索并添加装备（关键词模糊搜索预置库）">
            <Space.Compact style={{ width: '100%' }}>
              <AutoComplete
                options={catalogOptions}
                onSearch={handleCatalogSearch}
                onSelect={(_: string, option: any) => {
                  const item = option.item;
                  if (createEquipList.find(e => e.id === item.id)) { message.warning('该装备已添加，请直接修改数量'); return; }
                  setCreateEquipList(prev => [...prev, {
                    id: item.id, name: item.name, gearScore: item.gearScore,
                    category: item.category, quantity: 1,
                  }]);
                  setCatalogOptions([]);
                }}
                placeholder="输入装备名称搜索..."
                style={{ width: '100%' }}
                value=""
              />
            </Space.Compact>
          </Form.Item>

          {/* 已添加装备列表 + F-103 数量输入 */}
          {createEquipList.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>已添加装备（{createEquipList.length}件 / 总量 {createEquipList.reduce((s, e) => s + e.quantity, 0)}）：</Text>
              <Table size="small" pagination={false} dataSource={createEquipList} rowKey="id" style={{ marginTop: 8 }}
                columns={[
                  { title: '装备名称', dataIndex: 'name', key: 'name' },
                  { title: '装等', key: 'gs', width: 60, render: (_: any, r: any) => r.gearScore ? `P${r.gearScore}` : '-' },
                  { title: '部位', dataIndex: 'category', key: 'cat', width: 60 },
                  {
                    title: '数量', key: 'qty', width: 90,
                    render: (_: any, r: any) => (
                      <InputNumber min={1} max={99} value={r.quantity} size="small" style={{ width: 70 }}
                        onChange={(v) => setCreateEquipList(prev => prev.map(e => e.id === r.id ? { ...e, quantity: v || 1 } : e))}
                      />
                    ),
                  },
                  { title: '', key: 'del', width: 50, render: (_: any, r: any) => (
                    <Button size="small" type="link" danger icon={<DeleteOutlined />}
                      onClick={() => setCreateEquipList(prev => prev.filter(e => e.id !== r.id))} />
                  )},
                ]}
              />
            </div>
          )}

          <Space>
            <Form.Item name="applyType" label="类型">
              <Select style={{ width: 130 }}>
                <Select.Option value="死亡补装">死亡补装</Select.Option>
                <Select.Option value="REOC">REOC</Select.Option>
                <Select.Option value="手动创建">手动创建</Select.Option>
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="kookNickname" label="申请人昵称"><Input placeholder="含箱子编号自动提取，如 玩家A 3-16" /></Form.Item>
          <Form.Item name="reason" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block disabled={createEquipList.length === 0}>
              创建补装申请（共 {createEquipList.reduce((s, e) => s + e.quantity, 0)} 件装备）
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 驳回原因弹窗 */}
      <Modal title="驳回原因" open={rejectModal} onCancel={() => { setRejectModal(false); setRejectReason(''); }}
        onOk={handleReject} okText="确认驳回" okButtonProps={{ danger: true }}>
        <Input.TextArea rows={3} placeholder="请填写驳回原因（必填）"
          value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
      </Modal>

      {/* 需求4A：分配补装房间弹窗 */}
      <Modal title={`分配补装房间 (${selectedIds.length} 条)`} open={roomModal}
        onCancel={() => { setRoomModal(false); setSelectedRoom(''); }}
        onOk={handleAssignRoom} okText="确认分配">
        <Text style={{ display: 'block', marginBottom: 12 }}>选择要分配的补装房间：</Text>
        <Select
          value={selectedRoom || undefined}
          onChange={setSelectedRoom}
          placeholder="选择房间"
          style={{ width: '100%' }}
        >
          {RESUPPLY_ROOMS.map(r => <Select.Option key={r} value={r}>{r}号房</Select.Option>)}
        </Select>
      </Modal>

      {/* 需求4B：装备聚合排序弹窗 */}
      <Modal
        title="装备聚合排序（待补装）"
        open={groupModal}
        onCancel={() => setGroupModal(false)}
        width={900}
        footer={<Button onClick={() => setGroupModal(false)}>关闭</Button>}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input
            placeholder="关键词（如 P8+堕神）"
            value={groupKeyword}
            onChange={e => setGroupKeyword(e.target.value)}
            onPressEnter={() => handleOpenGroupView(groupKeyword)}
            style={{ width: 250 }}
            prefix={<SearchOutlined />}
          />
          <Button type="primary" onClick={() => handleOpenGroupView(groupKeyword)}>搜索聚合</Button>
          <Button onClick={() => { setGroupKeyword(''); handleOpenGroupView(''); }}>清空</Button>
        </Space>
        <Table
          dataSource={groupList}
          rowKey="id"
          loading={groupLoading}
          size="small"
          pagination={false}
          scroll={{ y: 500 }}
          columns={[
            { title: 'ID', dataIndex: 'id', width: 60 },
            { title: '申请人', dataIndex: 'kookNickname', width: 120, ellipsis: true },
            {
              title: '箱子', dataIndex: 'resupplyBox', width: 80,
              render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-',
            },
            { title: '装备', dataIndex: 'equipmentName', ellipsis: true },
            {
              title: '装等', key: 'gs', width: 60,
              render: (_: any, r: any) => r.gearScore ? `P${r.gearScore}` : '-',
            },
            {
              title: '房间', dataIndex: 'resupplyRoom', width: 70,
              render: (v: string) => v ? <Tag color="volcano">{v}</Tag> : '-',
            },
            {
              title: '时间', dataIndex: 'createdAt', width: 110,
              render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
            },
          ]}
        />
        <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
          共 {groupList.length} 条待补装记录，按装备名聚合+装等降序排列
        </Text>
      </Modal>
    </div>
  );

  /** 渲染补装列表 Tab（抽出来便于 Tabs 使用） */
  function renderResupplyListTab() {
    return (
      <>
        {/* 筛选栏：状态 → 日期 → 关键词 → 装等 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            <Select placeholder="状态" allowClear style={{ width: 120 }} value={statusFilter}
              onChange={v => setStatusFilter(v)}>
              {Object.entries(RESUPPLY_STATUS).map(([k, v]) => <Select.Option key={k} value={Number(k)}>{v}</Select.Option>)}
            </Select>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(dates) => setDateRange(dates as any)}
              style={{ width: 240 }}
            />
            <Input placeholder="搜索装备/申请人" prefix={<SearchOutlined />} allowClear
              value={keyword} onChange={e => setKeyword(e.target.value)} onPressEnter={handleSearch} style={{ width: 200 }} />
            <Select placeholder="装等" allowClear style={{ width: 90 }}
              onChange={(v: number | undefined) => { setKeyword(v ? `P${v}` : ''); }}>
              {[4,5,6,7,8,9,10,11,12].map(g => <Select.Option key={g} value={g}>P{g}</Select.Option>)}
            </Select>
            <Button type="primary" onClick={handleSearch}>查询</Button>
          </Space>
          {/* 批量操作栏 */}
          {canProcess && selectedIds.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0f5ff', borderRadius: 6 }}>
              <Space>
                <Text>已选 {selectedIds.length} 条待处理</Text>
                <Popconfirm title={`批量通过 ${selectedIds.length} 条？`} onConfirm={() => handleBatchProcess('approve')}>
                  <Button size="small" type="primary" style={{ background: '#52c41a', borderColor: '#52c41a' }}>批量通过</Button>
                </Popconfirm>
                <Button size="small" icon={<HomeOutlined />} onClick={() => setRoomModal(true)}>
                  分配补装房间
                </Button>
                <Button size="small" icon={<OrderedListOutlined />} onClick={() => handleOpenGroupView()}>
                  装备聚合排序
                </Button>
              </Space>
            </div>
          )}
        </Card>

        <Card>
          {mergedView ? (
            <>
              <Tag color="blue" style={{ marginBottom: 12 }}>合并视图：同一用户+同一截图+同一天的多件装备合并为一行</Tag>
              <Table
                dataSource={mergedList}
                rowKey="key"
                loading={mergedLoading}
                size="middle"
                scroll={{ x: 1000 }}
                pagination={{ current: page, total: mergedTotal, pageSize: 20, showTotal: t => `共 ${t} 组`, onChange: p => { setPage(p); fetchMergedList(p); } }}
                columns={[
                  { title: '申请人', dataIndex: 'kookNickname', key: 'nick', width: 120, ellipsis: true },
                  {
                    title: '箱子', dataIndex: 'resupplyBox', key: 'box', width: 80,
                    render: (v: string) => v ? <Tag color="geekblue">{v}</Tag> : '-',
                  },
                  {
                    title: '装备列表', dataIndex: 'equipmentSummary', key: 'equips',
                    render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text>,
                  },
                  { title: '总数', dataIndex: 'totalQuantity', key: 'qty', width: 60 },
                  {
                    title: '件数', key: 'count', width: 60,
                    render: (_: any, r: any) => r.items?.length || 0,
                  },
                  {
                    title: '状态', key: 'status', width: 90,
                    render: (_: any, r: any) => <Tag color={STATUS_COLORS[r.status]}>{RESUPPLY_STATUS[r.status]}</Tag>,
                  },
                  {
                    title: '截图', key: 'screenshot', width: 60,
                    render: (_: any, r: any) => r.screenshotUrl ? <Image src={r.screenshotUrl} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 4 }} /> : '-',
                  },
                  {
                    title: '时间', dataIndex: 'createdAt', key: 'time', width: 140,
                    render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
                  },
                  {
                    title: '操作', key: 'actions', width: 80,
                    render: (_: any, r: any) => (
                      <Button size="small" type="link" icon={<EyeOutlined />}
                        onClick={() => { if (r.items?.[0]?.id) openDetail(r.items[0].id); }}>详情</Button>
                    ),
                  },
                ]}
                expandable={{
                  expandedRowRender: (record: any) => (
                    <Table
                      dataSource={record.items}
                      rowKey="id"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: 'ID', dataIndex: 'id', width: 60 },
                        { title: '装备', dataIndex: 'equipmentName' },
                        { title: '装等', key: 'gs', width: 60, render: (_: any, r: any) => r.gearScore ? `P${r.gearScore}` : '-' },
                        { title: '数量', dataIndex: 'quantity', width: 60 },
                        {
                          title: '状态', dataIndex: 'status', width: 90,
                          render: (s: number) => <Tag color={STATUS_COLORS[s]}>{RESUPPLY_STATUS[s]}</Tag>,
                        },
                        {
                          title: '操作', key: 'actions', width: 100,
                          render: (_: any, r: any) => (
                            <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>详情</Button>
                          ),
                        },
                      ]}
                    />
                  ),
                }}
              />
            </>
          ) : (
            <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="middle" scroll={{ x: 1100 }}
              rowSelection={canProcess ? { selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as number[]),
                getCheckboxProps: (r: GuildResupply) => ({ disabled: r.status !== 0 }),
              } : undefined}
              pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }}
            />
          )}
        </Card>
      </>
    );
  }
}

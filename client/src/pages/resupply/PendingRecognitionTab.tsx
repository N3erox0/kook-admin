import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Typography, message, Modal, Image, Popconfirm, Input, Form, InputNumber, AutoComplete, Collapse } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, ThunderboltOutlined, ScanOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getKookPending, getOcrBatchDetail } from '@/api/ocr';
import { searchCatalog } from '@/api/catalog';
import { quickCompleteResupply, batchRejectResupply, createResupply } from '@/api/resupply';
import { formatEquipName } from '@/types';
import MatchPreview, { ConfirmedItem } from './components/MatchPreview';

const { Text } = Typography;

const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待识别', color: 'orange' },
  recognized: { label: '已识别', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  saved: { label: '已入库', color: 'cyan' },
  failed: { label: '失败', color: 'red' },
};

interface Props {
  guildId: number;
  canProcess: boolean;
  onRefresh?: () => void;
}

/**
 * F-107/F-108: 补装管理 → 待识别 Tab
 * 列表显示所有 source='kook' 的 OCR 批次（识别失败/置信度不足/OC碎未匹配）
 * 支持：
 *   - 批量勾选废弃（路径A）
 *   - 单条修正装备列表后直接完成补装（路径B，扣库存+标记已发放）
 */
export default function PendingRecognitionTab({ guildId, canProcess, onRefresh }: Props) {
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // 详情/修正弹窗
  const [detailModal, setDetailModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editEquipList, setEditEquipList] = useState<{ id: number; name: string; gearScore?: number; category?: string; quantity: number }[]>([]);
  const [editKookNickname, setEditKookNickname] = useState('');
  const [catalogOptions, setCatalogOptions] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getKookPending(guildId, { page: p, pageSize: 20 });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(1); }, [guildId]);

  const openDetail = async (batchId: number) => {
    setDetailModal(true);
    setDetailLoading(true);
    try {
      const res: any = await getOcrBatchDetail(guildId, batchId);
      setDetail(res);
      setEditKookNickname(res?.batch?.kookNickname || res?.kookNickname || '');
      // 初始化装备列表：优先已匹配到参考库的项
      const items = res?.items || [];
      const initList = items
        .filter((it: any) => it.matchedCatalogId)
        .map((it: any) => ({
          id: it.matchedCatalogId,
          name: it.matchedCatalogName || it.equipmentName,
          gearScore: it.gearScore,
          category: it.category,
          quantity: it.quantity || 1,
        }));
      setEditEquipList(initList);
    } catch {} finally { setDetailLoading(false); }
  };

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

  /** V2.9.3: 图像识别预览回调 — 将勾选结果合并进修正装备列表 */
  const handleMatchConfirm = (items: ConfirmedItem[]) => {
    if (items.length === 0) return;
    setEditEquipList(prev => {
      const map = new Map<number, typeof prev[0]>();
      for (const e of prev) map.set(e.id, { ...e });
      for (const it of items) {
        const ex = map.get(it.catalogId);
        if (ex) ex.quantity += it.quantity;
        else map.set(it.catalogId, {
          id: it.catalogId,
          name: it.name,
          gearScore: it.gearScore,
          category: it.category,
          quantity: it.quantity,
        });
      }
      return Array.from(map.values());
    });
    message.success(`已添加 ${items.length} 件装备到列表（合计 ${items.reduce((s, i) => s + i.quantity, 0)} 件）`);
  };

  /** 路径A: 批量废弃 — 将选中批次关联的所有补装申请废弃（当前批次source=kook本身不在resupply中，故只更新批次状态） */
  const handleBatchDiscard = async () => {
    if (selectedIds.length === 0) { message.warning('请先选择记录'); return; }
    // 待识别批次本身在 ocr_recognition_batch 表，尚未生成 resupply 记录
    // 废弃方式：遍历每个批次的 items 全部标记 discarded（通过已有 confirmOcrItem 接口）
    // 简化：走后端批量 API — 这里使用补装的 batch-reject（如果后续批次生成了 resupply）
    // 实际上 batch-reject 针对的是 guild_resupply 表，而当前批次在 ocr_recognition_batch
    // 所以这里应调用 ocr 的 discardBatch（待后端补齐），临时方案：逐条调用 confirmOcrItem discarded
    try {
      const { confirmOcrItem } = await import('@/api/ocr');
      let done = 0;
      for (const batchId of selectedIds) {
        try {
          const batchDetail: any = await getOcrBatchDetail(guildId, batchId);
          const items = batchDetail?.items || [];
          for (const it of items) {
            if (it.status === 'pending') {
              await confirmOcrItem(guildId, it.id, { status: 'discarded' });
            }
          }
          done++;
        } catch {}
      }
      message.success(`已废弃 ${done} 个批次`);
      setSelectedIds([]);
      fetchList();
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.message || '批量废弃失败');
    }
  };

  /** 路径B: 单条修正+确认补装完成
   * 逻辑：
   *  1. 从待识别批次的 items 生成 guild_resupply 记录（走创建接口）
   *  2. 对新创建的 resupply 调用 quick-complete（扣库存+标记已发放）
   *  3. 标记该批次所有 items 为 saved（避免重复处理）
   */
  const handleConfirmAndComplete = async () => {
    if (!detail) return;
    if (editEquipList.length === 0) { message.warning('请至少添加一件装备'); return; }
    setSubmitting(true);
    try {
      const equipmentEntries = editEquipList.map(e => ({ catalogId: e.id, quantity: e.quantity }));
      // 1. 创建补装申请
      const batch = detail.batch || detail;
      const createRes: any = await createResupply(guildId, {
        kookUserId: batch.kookUserId,
        kookNickname: editKookNickname || batch.kookNickname,
        equipmentEntries,
        applyType: '待识别确认',
        reason: `待识别批次 #${batch.id} 人工确认`,
        screenshotUrl: batch.imageUrl || undefined,
      });
      if (createRes?.deduplicated) {
        message.warning(`补装已存在（去重），ID=${createRes.existingId}`);
      } else {
        const newId = createRes?.id;
        if (!newId) throw new Error('创建补装失败');
        // 2. 快捷完成（扣库存）
        await quickCompleteResupply(guildId, newId, {
          equipmentEntries,
          remark: `待识别批次#${batch.id}修正后确认`,
        });
      }
      // 3. 标记批次 items 为 discarded（避免重复）
      const { confirmOcrItem } = await import('@/api/ocr');
      for (const it of (detail.items || [])) {
        if (it.status === 'pending') {
          try { await confirmOcrItem(guildId, it.id, { status: 'discarded' }); } catch {}
        }
      }
      message.success('补装已完成（库存已扣减）');
      setDetailModal(false);
      setDetail(null);
      setEditEquipList([]);
      fetchList();
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

  /** 路径A: 单条废弃 */
  const handleDiscardBatch = async (batchId: number) => {
    try {
      const { confirmOcrItem } = await import('@/api/ocr');
      const res: any = await getOcrBatchDetail(guildId, batchId);
      const items = res?.items || [];
      for (const it of items) {
        if (it.status === 'pending') {
          await confirmOcrItem(guildId, it.id, { status: 'discarded' });
        }
      }
      message.success('已废弃');
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '废弃失败');
    }
  };

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const info = BATCH_STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: 'KOOK用户', dataIndex: 'kookNickname', width: 140, ellipsis: true },
    { title: '装备数', dataIndex: 'totalItems', width: 70 },
    {
      title: '截图', dataIndex: 'imageUrl', width: 80,
      render: (v: string) => v ? <Image src={v} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} /> : <Text type="secondary">文字</Text>,
    },
    {
      title: '时间', dataIndex: 'createdAt', width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>修正</Button>
          {canProcess && (
            <Popconfirm title="确认废弃？" onConfirm={() => handleDiscardBatch(r.id)}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>废弃</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          OCR 未匹配/置信度不足/文字未匹配 OC碎 的记录会在这里汇总，人工确认后可直接扣库存完成补装
        </Text>
      </Space>

      {canProcess && selectedIds.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fff2e8', borderRadius: 6 }}>
          <Space>
            <Text>已选 {selectedIds.length} 条</Text>
            <Popconfirm title={`批量废弃 ${selectedIds.length} 条？`} onConfirm={handleBatchDiscard}>
              <Button size="small" danger icon={<DeleteOutlined />}>批量废弃</Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={list}
        rowKey="id"
        loading={loading}
        size="middle"
        rowSelection={canProcess ? {
          selectedRowKeys: selectedIds,
          onChange: (keys) => setSelectedIds(keys as number[]),
        } : undefined}
        pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }}
      />

      {/* 修正弹窗 */}
      <Modal
        title="待识别记录 - 修正并完成补装"
        open={detailModal}
        onCancel={() => { setDetailModal(false); setDetail(null); setEditEquipList([]); }}
        width={1100}
        centered
        footer={null}
        destroyOnClose
      >
        {detailLoading ? <Text>加载中...</Text> : detail && (
          <div>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <div><Text strong>批次号：</Text>{detail.batch?.batchNo || detail.batchNo}</div>
              <div><Text strong>KOOK用户ID：</Text>{detail.batch?.kookUserId || detail.kookUserId || '-'}</div>
              <Form.Item label="申请人昵称（可修改）" style={{ marginBottom: 8 }}>
                <Input value={editKookNickname} onChange={e => setEditKookNickname(e.target.value)} placeholder="含箱子编号自动提取，如 玩家A 3-16" />
              </Form.Item>
              {(detail.batch?.imageUrl || detail.imageUrl) && (
                <div><Text strong>截图：</Text><br />
                  <Image src={detail.batch?.imageUrl || detail.imageUrl} width={240} style={{ marginTop: 4, borderRadius: 8 }} />
                </div>
              )}
            </Space>

            {/* V2.9.3: 图像识别预览（可折叠） */}
            {(detail.batch?.imageUrl || detail.imageUrl) && (
              <Collapse
                style={{ marginBottom: 12 }}
                items={[{
                  key: 'match-preview',
                  label: <Space><ScanOutlined /><span>图像识别预览（点击展开，勾选后自动加入装备列表）</span></Space>,
                  children: (
                    <MatchPreview
                      guildId={guildId}
                      imageUrl={detail.batch?.imageUrl || detail.imageUrl}
                      onConfirm={handleMatchConfirm}
                      confirmText="加入装备列表"
                    />
                  ),
                }]}
              />
            )}

            {/* OCR 原始识别结果（参考） */}
            {detail.items?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>OCR 原始识别：</Text>
                <div style={{ background: '#fafafa', padding: 8, borderRadius: 4, maxHeight: 120, overflow: 'auto', fontSize: 12 }}>
                  {detail.items.map((it: any, i: number) => (
                    <div key={i}>
                      <Tag color={it.matchedCatalogId ? 'green' : 'orange'}>{it.status}</Tag>
                      {it.equipmentName}
                      {it.matchedCatalogName && <Text type="secondary"> → {it.matchedCatalogName}</Text>}
                      {it.confidence !== null && <Text type="secondary"> ({it.confidence}%)</Text>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 装备编辑区 */}
            <div style={{ marginBottom: 12 }}>
              <Text strong>补装装备列表（{editEquipList.length}件）：</Text>
              <div style={{ marginTop: 8 }}>
                <AutoComplete
                  options={catalogOptions}
                  onSearch={handleCatalogSearch}
                  onSelect={(_: string, option: any) => {
                    const item = option.item;
                    if (editEquipList.find(e => e.id === item.id)) { message.warning('该装备已添加'); return; }
                    setEditEquipList(prev => [...prev, {
                      id: item.id, name: item.name, gearScore: item.gearScore,
                      category: item.category, quantity: 1,
                    }]);
                    setCatalogOptions([]);
                  }}
                  placeholder="搜索参考库装备添加..."
                  style={{ width: '100%' }}
                  value=""
                />
              </div>
              {editEquipList.length > 0 && (
                <Table
                  size="small"
                  pagination={false}
                  dataSource={editEquipList}
                  rowKey="id"
                  style={{ marginTop: 8 }}
                  columns={[
                    { title: '装备名称', dataIndex: 'name', key: 'name' },
                    { title: '装等', key: 'gs', width: 60, render: (_: any, r: any) => r.gearScore ? `P${r.gearScore}` : '-' },
                    { title: '部位', dataIndex: 'category', key: 'cat', width: 60 },
                    {
                      title: '数量', key: 'qty', width: 90,
                      render: (_: any, r: any) => (
                        <InputNumber min={1} max={99} value={r.quantity}
                          onChange={(v) => setEditEquipList(prev => prev.map(e => e.id === r.id ? { ...e, quantity: v || 1 } : e))}
                          style={{ width: 70 }} size="small" />
                      ),
                    },
                    {
                      title: '', key: 'del', width: 50,
                      render: (_: any, r: any) => (
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}
                          onClick={() => setEditEquipList(prev => prev.filter(e => e.id !== r.id))} />
                      ),
                    },
                  ]}
                />
              )}
            </div>

            <Space style={{ marginTop: 12, width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setDetailModal(false)}>取消</Button>
              <Popconfirm title={`确认补装完成并扣减库存？${editEquipList.reduce((s, e) => s + e.quantity, 0)} 件`}
                onConfirm={handleConfirmAndComplete}>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={submitting}>
                  确认并补装完成
                </Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
}

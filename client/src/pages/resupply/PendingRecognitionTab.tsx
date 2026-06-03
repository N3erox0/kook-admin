import { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Typography, message, Modal, Image, Popconfirm, Input, Form, AutoComplete } from 'antd';
import { ReloadOutlined, DeleteOutlined, EyeOutlined, ThunderboltOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { getKookPending, getOcrBatchDetail } from '@/api/ocr';
import { searchCatalog } from '@/api/catalog';
import { quickCompleteResupply, batchRejectResupply, createResupply } from '@/api/resupply';
import { formatEquipName } from '@/types';

const { Text } = Typography;

const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待识别', color: 'orange' },
  recognized: { label: '已识别', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  saved: { label: '已入库', color: 'cyan' },
  failed: { label: '失败', color: 'red' },
};

/**
 * V3.2.1 待识别弹窗用的 7 个固定部位
 * 顺序：武器/副手/头/甲/鞋/披风/坐骑（药水/食物/背包丢弃）
 */
const SEVEN_SLOTS: { slot: string; label: string; category: string }[] = [
  { slot: 'MainHand', label: '武器', category: '武器' },
  { slot: 'OffHand',  label: '副手', category: '副手' },
  { slot: 'Head',     label: '头',   category: '头' },
  { slot: 'Armor',    label: '甲',   category: '甲' },
  { slot: 'Shoes',    label: '鞋',   category: '鞋' },
  { slot: 'Cape',     label: '披风', category: '披风' },
  { slot: 'Mount',    label: '坐骑', category: '坐骑' },
];

const SEVEN_CATEGORIES = new Set(SEVEN_SLOTS.map((s) => s.category));

/** 槽位录入项类型 */
interface SlotItem {
  slot: string;
  label: string;
  category: string;
  catalogId: number | null;
  name: string;
  gearScore: number | null;
  itemCategory: string | null; // 实际选中装备的部位（用于警告）
}

function makeEmptySlots(): SlotItem[] {
  return SEVEN_SLOTS.map((s) => ({
    slot: s.slot,
    label: s.label,
    category: s.category,
    catalogId: null,
    name: '',
    gearScore: null,
    itemCategory: null,
  }));
}

interface Props {
  guildId: number;
  canProcess: boolean;
  onRefresh?: () => void;
}

/**
 * V3.2.1 补装管理 → 待识别 Tab
 *
 * 触发链路：KOOK 监听频道发死亡截图
 *   → OCR 识别"击杀详情"
 *   → 提取玩家ID + UTC时间
 *   → 战报匹配
 *   → 装备 7 部位全命中参考库 → 直接创建 pending 补装
 *   → 任一未命中或战报匹配失败 → 整条进入"待识别"
 *
 * 弹窗：固定 7 行（武器/副手/头/甲/鞋/披风/坐骑），每行独立搜索 + 按部位过滤
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
  const [slots, setSlots] = useState<SlotItem[]>(makeEmptySlots());
  const [editKookNickname, setEditKookNickname] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 每行的搜索状态：{slot: {options, value}}
  const [slotSearchState, setSlotSearchState] = useState<Record<string, { options: any[]; value: string }>>({});

  // 未匹配装备的提示信息（OCR 战报中未命中参考库的）
  const [unmatchedHints, setUnmatchedHints] = useState<string[]>([]);

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
    setSlots(makeEmptySlots());
    setSlotSearchState({});
    setUnmatchedHints([]);
    try {
      const res: any = await getOcrBatchDetail(guildId, batchId);
      setDetail(res);
      setEditKookNickname(res?.batch?.kookNickname || res?.kookNickname || '');

      // 已匹配的装备按部位预填到 7 个槽位（仅 7 部位之一）
      const items = res?.items || [];
      const next = makeEmptySlots();
      const unmatched: string[] = [];

      for (const it of items) {
        if (!it.matchedCatalogId) {
          // 未命中参考库 → 提示给管理员
          if (it.equipmentName) unmatched.push(it.equipmentName);
          continue;
        }
        const cat = it.category || '';
        if (!SEVEN_CATEGORIES.has(cat)) continue; // 非 7 部位（药水/食物/背包/其他）丢弃

        const slotIdx = next.findIndex((s) => s.category === cat);
        if (slotIdx < 0) continue;
        if (next[slotIdx].catalogId) continue; // 同部位已填，跳过

        next[slotIdx].catalogId = it.matchedCatalogId;
        next[slotIdx].name = it.matchedCatalogName || it.equipmentName || '';
        next[slotIdx].gearScore = it.gearScore ?? null;
        next[slotIdx].itemCategory = cat;
      }

      setSlots(next);
      setUnmatchedHints(unmatched);
    } catch {} finally { setDetailLoading(false); }
  };

  /** 单行搜索：按该行部位过滤参考库 */
  const handleSlotSearch = async (slot: string, slotCategory: string, kw: string) => {
    setSlotSearchState((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] || { options: [], value: '' }), value: kw },
    }));
    if (!kw || kw.length < 1) {
      setSlotSearchState((prev) => ({ ...prev, [slot]: { options: [], value: kw } }));
      return;
    }
    try {
      const res: any = await searchCatalog(kw.trim());
      // 前端按部位过滤：优先返回该行部位的装备，其他部位也展示但加灰色提示
      const sameCat = (res || []).filter((it: any) => it.category === slotCategory);
      const others = (res || []).filter(
        (it: any) => it.category !== slotCategory && SEVEN_CATEGORIES.has(it.category),
      );
      const all = [...sameCat, ...others];
      const opts = all.map((it: any) => ({
        value: `${it.id}|${formatEquipName(it)}`,
        label: (
          <Space>
            {it.category === slotCategory ? (
              <Tag color="blue">{it.category}</Tag>
            ) : (
              <Tag color="orange">{it.category}</Tag>
            )}
            <span>{formatEquipName(it)}</span>
          </Space>
        ),
        item: it,
      }));
      setSlotSearchState((prev) => ({ ...prev, [slot]: { options: opts, value: kw } }));
    } catch {
      setSlotSearchState((prev) => ({ ...prev, [slot]: { options: [], value: kw } }));
    }
  };

  /** 选中装备填入槽位 */
  const handleSlotSelect = (slot: string, _val: string, option: any) => {
    const item = option.item;
    setSlots((prev) =>
      prev.map((s) =>
        s.slot === slot
          ? {
              ...s,
              catalogId: item.id,
              name: item.name,
              gearScore: item.gearScore ?? null,
              itemCategory: item.category || null,
            }
          : s,
      ),
    );
    setSlotSearchState((prev) => ({ ...prev, [slot]: { options: [], value: '' } }));
  };

  /** 清空指定槽位 */
  const handleSlotClear = (slot: string) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.slot === slot
          ? { ...s, catalogId: null, name: '', gearScore: null, itemCategory: null }
          : s,
      ),
    );
    setSlotSearchState((prev) => ({ ...prev, [slot]: { options: [], value: '' } }));
  };

  const handleBatchDiscard = async () => {
    if (selectedIds.length === 0) { message.warning('请先选择记录'); return; }
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

  /** 提交：取已填的槽位创建补装 + quickComplete */
  const handleConfirmAndComplete = async () => {
    if (!detail) return;
    const filled = slots.filter((s) => s.catalogId);
    if (filled.length === 0) { message.warning('至少填一件装备'); return; }
    setSubmitting(true);
    try {
      const equipmentEntries = filled.map((s) => ({ catalogId: s.catalogId!, quantity: 1 }));
      const batch = detail.batch || detail;
      const createRes: any = await createResupply(guildId, {
        kookUserId: batch.kookUserId,
        kookNickname: editKookNickname || batch.kookNickname,
        equipmentEntries,
        applyType: '死亡补装',
        reason: `待识别批次 #${batch.id} 人工确认`,
        screenshotUrl: batch.imageUrl || undefined,
      });
      if (createRes?.deduplicated) {
        message.warning(`补装已存在（去重），ID=${createRes.existingId}`);
      } else {
        const newId = createRes?.id;
        if (!newId) throw new Error('创建补装失败');
        await quickCompleteResupply(guildId, newId, {
          equipmentEntries,
          remark: `待识别批次#${batch.id}修正后确认`,
        });
      }
      // 标记批次 items 为 discarded（避免重复）
      const { confirmOcrItem } = await import('@/api/ocr');
      for (const it of (detail.items || [])) {
        if (it.status === 'pending') {
          try { await confirmOcrItem(guildId, it.id, { status: 'discarded' }); } catch {}
        }
      }
      message.success('补装已完成（库存已扣减）');
      setDetailModal(false);
      setDetail(null);
      setSlots(makeEmptySlots());
      fetchList();
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.message || '操作失败');
    } finally {
      setSubmitting(false);
    }
  };

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

  const filledCount = slots.filter((s) => s.catalogId).length;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
        <Text type="secondary" style={{ fontSize: 12 }}>
          KOOK 战报截图未匹配/装备未在参考库的记录会汇总在这里，人工确认后扣库存完成补装
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

      {/* V3.2.1 修正弹窗 — 7 部位行内搜索 */}
      <Modal
        title="待识别记录 — 修正并完成补装"
        open={detailModal}
        onCancel={() => { setDetailModal(false); setDetail(null); setSlots(makeEmptySlots()); setUnmatchedHints([]); }}
        width={1080}
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
                <Input value={editKookNickname} onChange={(e) => setEditKookNickname(e.target.value)} placeholder="如 玩家A 3-16" />
              </Form.Item>
              {/* V3.3.1 F-358: 显示原始 KOOK 消息（保存在 batch.errorMessage 字段） */}
              {(detail.batch?.errorMessage || detail.errorMessage) && (
                <div style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 4,
                  padding: 10,
                  marginBottom: 8,
                }}>
                  <Text strong style={{ color: '#389e0d', fontSize: 12 }}>📩 原始 KOOK 消息：</Text>
                  <div style={{
                    marginTop: 4,
                    color: '#262626',
                    fontFamily: 'Menlo, Consolas, monospace',
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
                    {detail.batch?.errorMessage || detail.errorMessage}
                  </div>
                </div>
              )}
            </Space>

            <div style={{ display: 'flex', gap: 16 }}>
              {/* 左：战报截图大图 */}
              <div style={{ flex: '0 0 360px' }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>战报截图：</Text>
                {(detail.batch?.imageUrl || detail.imageUrl) ? (
                  <Image
                    src={detail.batch?.imageUrl || detail.imageUrl}
                    width={360}
                    style={{ borderRadius: 8, border: '1px solid #f0f0f0' }}
                  />
                ) : (
                  <Text type="secondary">无截图</Text>
                )}
                {unmatchedHints.length > 0 && (
                  <div style={{ marginTop: 12, padding: 8, background: '#fff7e6', borderRadius: 4 }}>
                    <Text strong style={{ fontSize: 12, color: '#fa8c16' }}>战报中未在参考库的装备：</Text>
                    <div style={{ marginTop: 4 }}>
                      {unmatchedHints.map((n, i) => (
                        <Tag key={i} color="orange" style={{ margin: '2px 4px 2px 0' }}>{n}</Tag>
                      ))}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11 }}>请在右侧 7 个部位中手动选择对应装备</Text>
                  </div>
                )}
              </div>

              {/* 右：7 部位行内搜索 */}
              <div style={{ flex: 1 }}>
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  补装装备清单（已填 {filledCount}/7）：
                </Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={slots}
                  rowKey="slot"
                  columns={[
                    {
                      title: '部位', dataIndex: 'label', width: 70,
                      render: (v: string) => <Tag color="default" style={{ fontSize: 13 }}>{v}</Tag>,
                    },
                    {
                      title: '装备',
                      key: 'equip',
                      render: (_: any, r: SlotItem) => {
                        if (r.catalogId) {
                          const isMismatch = r.itemCategory && r.itemCategory !== r.category;
                          return (
                            <Space>
                              <Tag color={isMismatch ? 'orange' : 'blue'} style={{ fontSize: 13 }}>
                                {r.name}
                              </Tag>
                              {isMismatch && (
                                <Text type="warning" style={{ fontSize: 11 }}>
                                  ⚠ 实际部位: {r.itemCategory}
                                </Text>
                              )}
                            </Space>
                          );
                        }
                        const state = slotSearchState[r.slot] || { options: [], value: '' };
                        return (
                          <AutoComplete
                            options={state.options}
                            value={state.value}
                            onSearch={(kw) => handleSlotSearch(r.slot, r.category, kw)}
                            onSelect={(val, opt) => handleSlotSelect(r.slot, val, opt)}
                            onChange={(v) => setSlotSearchState((prev) => ({ ...prev, [r.slot]: { ...(prev[r.slot] || { options: [] }), value: v } }))}
                            placeholder={`搜索"${r.label}"装备...`}
                            style={{ width: '100%' }}
                            allowClear
                          />
                        );
                      },
                    },
                    {
                      title: '装等', dataIndex: 'gearScore', width: 60,
                      render: (v: number | null) => v ? <Tag>P{v}</Tag> : <Text type="secondary">—</Text>,
                    },
                    {
                      title: '', key: 'clear', width: 50,
                      render: (_: any, r: SlotItem) =>
                        r.catalogId ? (
                          <Button size="small" type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleSlotClear(r.slot)} />
                        ) : null,
                    },
                  ]}
                />
              </div>
            </div>

            <Space style={{ marginTop: 16, width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setDetailModal(false)}>取消</Button>
              <Popconfirm title={`确认补装完成并扣减库存？${filledCount} 件`} onConfirm={handleConfirmAndComplete}>
                <Button type="primary" icon={<ThunderboltOutlined />} loading={submitting} disabled={filledCount === 0}>
                  确认并补装完成（{filledCount} 件）
                </Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  );
}

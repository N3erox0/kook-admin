import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Input, DatePicker, Typography, message, Tag, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { getBattleReports, pullBattleReports } from '@/api/battleReport';
import { useGuildStore } from '@/stores/guild.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

/**
 * V3.2 战报记录页
 * - 列表行精简
 * - 展开行：10 部位装备分组
 * - 单装备格式：{level}.{enchantLevel} {部位} {名称}
 * - 未匹配（catalogId=null）红色 + 悬停显示完整 albionId
 */

// 10 个部位的展示顺序与中文名（与 Albion API slot 对齐）
const SLOT_ORDER: { slot: string; label: string }[] = [
  { slot: 'MainHand', label: '武器' },
  { slot: 'OffHand', label: '副手' },
  { slot: 'Head', label: '头' },
  { slot: 'Armor', label: '甲' },
  { slot: 'Shoes', label: '鞋' },
  { slot: 'Cape', label: '披风' },
  { slot: 'Mount', label: '坐骑' },
  { slot: 'Potion', label: '药水' },
  { slot: 'Food', label: '食物' },
  { slot: 'Bag', label: '背包' },
];

interface EquipmentItem {
  slot: string;
  albionId: string;
  name: string;
  level: number | null;
  enchantLevel: number | null;
  quality?: number;
  catalogId: number | null;
  category?: string | null;
  gearScore?: number | null;
  matchStatus?: 'matched' | 'unmatched';
}

/** 渲染单件装备：{level}.{enchant} 部位 名称（V3.2 紧凑格式） */
function renderEquipmentText(item: EquipmentItem, slotLabel: string): string {
  const lv = item.level ?? '?';
  const en = item.enchantLevel ?? 0;
  // 优先用参考库 category（中文部位），否则用列表预定义 slotLabel
  const cat = item.category || slotLabel;
  const name = item.name || item.albionId || '未知';
  return `${lv}.${en} ${cat} ${name}`;
}

/** 判断是否未匹配（catalogId=null 且 matchStatus 也指示 unmatched） */
function isUnmatched(item: EquipmentItem): boolean {
  if (item.matchStatus === 'unmatched') return true;
  if (item.catalogId === null || item.catalogId === undefined) return true;
  return false;
}

export default function BattleReportPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const guildId = currentGuildId!;
  const isAdmin = currentGuildRole === 'super_admin' || currentGuildRole === 'inventory_admin';

  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [page, setPage] = useState(1);
  const [memberName, setMemberName] = useState('');
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 50 };
      if (memberName) params.memberName = memberName;
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');
      const res: any = await getBattleReports(guildId, params);
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, [guildId]);

  const handlePull = async () => {
    setPulling(true);
    try {
      const res: any = await pullBattleReports(guildId);
      if (res?.status === 'already_running') {
        message.warning(res.message || '该公会战报拉取任务已在运行');
      } else {
        message.success('战报拉取已启动，请稍后刷新查看');
      }
    } catch {
      message.error('拉取失败，请检查 Albion 公会ID 配置');
    } finally { setPulling(false); }
  };

  // 是否任意一行有 deathMap（用于动态显示该列）
  const hasAnyMap = list.some((r) => r.deathMap);

  const columns: any[] = [
    { title: '成员', dataIndex: 'memberName', width: 120 },
    {
      title: '死亡时间',
      dataIndex: 'deathTime',
      width: 130,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    ...(hasAnyMap
      ? [{
          title: '死亡地图',
          dataIndex: 'deathMap',
          width: 160,
          ellipsis: true,
          render: (v: string) => v || <Text type="secondary">-</Text>,
        }]
      : []),
    {
      title: '击杀公会',
      dataIndex: 'killerGuild',
      width: 140,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">-</Text>,
    },
    {
      title: '装备详情',
      dataIndex: 'equipmentList',
      key: 'equipmentList',
      render: (items: any[]) => {
        if (!items || items.length === 0) return <Text type="secondary">无</Text>;
        const PREVIEW = 4;
        return (
          <Space size={[4, 4]} wrap>
            {items.slice(0, PREVIEW).map((it, i) => {
              const lv = it.level ?? '?';
              const en = it.enchantLevel ?? 0;
              const isUnmatched = it.matchStatus === 'unmatched' || it.catalogId == null;
              const text = `${lv}.${en} ${it.name || it.albionId || '?'}`;
              return (
                <Tag key={i} color={isUnmatched ? 'red' : 'blue'}>
                  {text}
                </Tag>
              );
            })}
            {items.length > PREVIEW && <Tag>+{items.length - PREVIEW}</Tag>}
            <Text type="secondary" style={{ fontSize: 11 }}>(点击行展开)</Text>
          </Space>
        );
      },
    },
    {
      title: '已补装',
      dataIndex: 'matchedResupply',
      width: 90,
      render: (v: boolean) => v ? <Tag color="green">已匹配</Tag> : <Tag>未匹配</Tag>,
    },
  ];

  /** 展开行：按 10 部位渲染装备 */
  const expandedRowRender = (record: any) => {
    const items: EquipmentItem[] = Array.isArray(record.equipmentList) ? record.equipmentList : [];
    // 按 slot 分组
    const slotMap = new Map<string, EquipmentItem>();
    for (const it of items) {
      if (it && it.slot) slotMap.set(it.slot, it);
    }

    return (
      <div style={{ padding: '8px 0' }}>
        <Space size={[8, 8]} wrap>
          {SLOT_ORDER.map(({ slot, label }) => {
            const item = slotMap.get(slot);
            if (!item) {
              // 缺该部位
              return (
                <Tag key={slot} style={{ minWidth: 140, color: '#bfbfbf' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>{' '}
                  <Text type="secondary">—</Text>
                </Tag>
              );
            }
            const text = renderEquipmentText(item, label);
            const unmatched = isUnmatched(item);
            const tag = (
              <Tag key={slot} color={unmatched ? 'red' : 'blue'} style={{ minWidth: 140 }}>
                {text}
              </Tag>
            );
            return unmatched ? (
              <Tooltip key={slot} title={`未匹配参考库：${item.albionId || '未知'}`}>{tag}</Tooltip>
            ) : tag;
          })}
        </Space>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>战报记录</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          {isAdmin && (
            <Button type="primary" icon={<CloudDownloadOutlined />} loading={pulling} onClick={handlePull}>
              拉取战报
            </Button>
          )}
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索成员名"
            prefix={<SearchOutlined />}
            allowClear
            value={memberName}
            onChange={e => setMemberName(e.target.value)}
            onPressEnter={() => { setPage(1); fetchList(1); }}
            style={{ width: 180 }}
          />
          <RangePicker
            value={dateRange as any}
            onChange={(v) => setDateRange(v as any)}
          />
          <Button type="primary" onClick={() => { setPage(1); fetchList(1); }}>查询</Button>
        </Space>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          size="middle"
          expandable={{ expandedRowRender }}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            showTotal: t => `共 ${t} 条`,
            onChange: p => { setPage(p); fetchList(p); },
          }}
        />
      </Card>
    </div>
  );
}

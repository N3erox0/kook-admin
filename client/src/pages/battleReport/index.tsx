import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Input, DatePicker, Typography, message, Tag, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { getBattleReports, pullBattleReports } from '@/api/battleReport';
import { useGuildStore } from '@/stores/guild.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

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
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, [guildId]);

  const handlePull = async () => {
    setPulling(true);
    try {
      const res: any = await pullBattleReports(guildId);
      message.success(`拉取完成：新增 ${res?.newRecords || 0} 条战报`);
      fetchList();
    } catch {
      message.error('拉取失败，请检查 Albion 公会ID 配置');
    } finally { setPulling(false); }
  };

  const columns = [
    {
      title: '成员',
      dataIndex: 'memberName',
      width: 120,
    },
    {
      title: '死亡时间',
      dataIndex: 'deathTime',
      width: 160,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '地图',
      dataIndex: 'deathMap',
      width: 150,
      ellipsis: true,
    },
    {
      title: '击杀者',
      dataIndex: 'killerName',
      width: 120,
      render: (v: string, r: any) => (
        <Tooltip title={r.killerGuild ? `[${r.killerGuild}]` : ''}>
          <span>{v || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: '装备数',
      dataIndex: 'equipmentList',
      width: 80,
      render: (v: any[]) => v?.length || 0,
    },
    {
      title: '装备列表',
      dataIndex: 'equipmentList',
      ellipsis: true,
      render: (items: any[]) => {
        if (!items || items.length === 0) return <Text type="secondary">无</Text>;
        return (
          <Space size={[4, 4]} wrap>
            {items.slice(0, 5).map((item, i) => (
              <Tag key={i} color={item.catalogId ? 'blue' : 'default'}>
                {item.name || item.albionId}
              </Tag>
            ))}
            {items.length > 5 && <Tag>+{items.length - 5}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '声望',
      dataIndex: 'totalKillFame',
      width: 80,
      render: (v: number) => v?.toLocaleString() || '0',
    },
    {
      title: '已补装',
      dataIndex: 'matchedResupply',
      width: 80,
      render: (v: boolean) => v ? <Tag color="green">已匹配</Tag> : <Tag>未匹配</Tag>,
    },
  ];

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

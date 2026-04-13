import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Spin, Tag, Button, Space, List, Badge, Tooltip, message, Avatar } from 'antd';
import {
  TeamOutlined, AppstoreOutlined, SyncOutlined, BankOutlined,
  UserOutlined, RobotOutlined, KeyOutlined, ReloadOutlined,
  WarningOutlined, ClockCircleOutlined, ArrowUpOutlined, ArrowDownOutlined,
  PlusCircleOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { useAuthStore } from '@/stores/auth.store';
import { useNavigate } from 'react-router-dom';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// ===== 模块一：系统超管控制台 =====

function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [guilds, setGuilds] = useState<any[]>([]);
  const [guildsLoading, setGuildsLoading] = useState(false);
  const [expandedGuild, setExpandedGuild] = useState<Record<number, any>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/dashboard');
      setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchGuilds = useCallback(async () => {
    setGuildsLoading(true);
    try {
      const res: any = await request.get('/guilds/all');
      setGuilds(res || []);
    } catch {} finally { setGuildsLoading(false); }
  }, []);

  useEffect(() => { fetchData(); fetchGuilds(); }, [fetchData, fetchGuilds]);

  // 展开行时加载公会子数据
  const loadGuildDetail = async (guildId: number) => {
    if (expandedGuild[guildId]) return;
    try {
      const [members, inventory, resupply] = await Promise.all([
        request.get(`/guild/${guildId}/members`, { params: { pageSize: 5 } }).catch(() => ({ list: [] })),
        request.get(`/guild/${guildId}/equipment`, { params: { pageSize: 5 } }).catch(() => ({ list: [], total: 0 })),
        request.get(`/guild/${guildId}/resupply`, { params: { pageSize: 5 } }).catch(() => ({ list: [], total: 0 })),
      ]);
      setExpandedGuild(prev => ({ ...prev, [guildId]: { members, inventory, resupply } }));
    } catch {}
  };

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const guildColumns = [
    {
      title: '公会名称', dataIndex: 'name', key: 'name',
      render: (v: string, r: any) => (
        <Space>
          {r.iconUrl ? <Avatar src={r.iconUrl} size="small" /> : <BankOutlined />}
          <Text strong>{v}</Text>
        </Space>
      ),
    },
    { title: 'KOOK服务器ID', dataIndex: 'kookGuildId', key: 'kookGuildId', width: 180, render: (v: string) => v || <Text type="secondary">未绑定</Text> },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (v: number) => v === 1 ? <Tag color="green">活跃</Tag> : <Tag color="red">禁用</Tag>,
    },
    {
      title: '邀请码', key: 'inviteCode', width: 120,
      render: (_: any, r: any) => r.inviteCodeId ? <Tag color="blue">已绑定</Tag> : <Tag>未绑定</Tag>,
    },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', width: 140, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
  ];

  const renderExpandedRow = (record: any) => {
    const detail = expandedGuild[record.id];
    if (!detail) return <Spin size="small" />;

    return (
      <div style={{ padding: '8px 0' }}>
        <Row gutter={[16, 12]}>
          <Col span={8}>
            <Card size="small" title={<Space><TeamOutlined />成员（前5）</Space>} extra={<Text type="secondary">{(detail.members as any)?.total || (detail.members as any)?.list?.length || 0}人</Text>}>
              <List size="small" dataSource={(detail.members as any)?.list || []} renderItem={(m: any) => (
                <List.Item><Text>{m.nickname}</Text><Tag>{m.role}</Tag></List.Item>
              )} locale={{ emptyText: '无成员' }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title={<Space><AppstoreOutlined />库存（前5）</Space>} extra={<Text type="secondary">共{(detail.inventory as any)?.total || 0}件</Text>}>
              <List size="small" dataSource={(detail.inventory as any)?.list || []} renderItem={(e: any) => (
                <List.Item><Text>{e.equipmentName}</Text><Tag>x{e.quantity}</Tag></List.Item>
              )} locale={{ emptyText: '无库存' }} />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small" title={<Space><SyncOutlined />补装（前5）</Space>} extra={<Text type="secondary">共{(detail.resupply as any)?.total || 0}条</Text>}>
              <List size="small" dataSource={(detail.resupply as any)?.list || []} renderItem={(r: any) => (
                <List.Item><Text>{r.equipmentName}</Text><Tag color={r.status === 0 ? 'orange' : 'green'}>{r.status === 0 ? '待处理' : '已处理'}</Tag></List.Item>
              )} locale={{ emptyText: '无补装' }} />
            </Card>
          </Col>
        </Row>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>SSVIP 管理中心</Title>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchData(); fetchGuilds(); }}>刷新</Button>
      </div>

      {/* 统计卡片 - 可点击跳转 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable onClick={() => { /* 滚动到下方公会列表 */ }} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><BankOutlined /> 注册公会数</Space>}
              value={data.totalGuilds}
              valueStyle={{ color: '#1677ff', fontSize: 32 }}
              suffix={data.guildsTrend !== 0 && (
                <Text style={{ fontSize: 14, color: data.guildsTrend > 0 ? '#52c41a' : '#ff4d4f' }}>
                  {data.guildsTrend > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                  {' '}{data.guildsTrend > 0 ? '+' : ''}{data.guildsTrend}
                </Text>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/admin/members')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><UserOutlined /> 注册用户数</Space>}
              value={data.totalUsers}
              valueStyle={{ color: '#722ed1', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/admin/invite-codes')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><KeyOutlined /> 邀请码总数</Space>}
              value={data.todayRedeemed}
              valueStyle={{ color: '#faad14', fontSize: 32 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>点击管理邀请码</Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable onClick={() => navigate('/admin/catalog')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><RobotOutlined /> 装备参考库</Space>}
              value={data.activeBots}
              valueStyle={{ color: '#52c41a', fontSize: 32 }}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>点击管理参考库</Text>
          </Card>
        </Col>
      </Row>

      {/* 公会列表 - 可展开查看子数据 */}
      <Card title="公会管理" size="small" style={{ marginTop: 16 }}>
        <Table
          columns={guildColumns}
          dataSource={guilds}
          rowKey="id"
          size="small"
          loading={guildsLoading}
          pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 个公会` }}
          expandable={{
            expandedRowRender: renderExpandedRow,
            onExpand: (expanded, record) => { if (expanded) loadGuildDetail(record.id); },
          }}
          locale={{ emptyText: '暂无公会' }}
        />
      </Card>

      {/* 异常监控 */}
      {data.anomalyGuilds?.length > 0 && (
        <Card
          title={<Space><WarningOutlined style={{ color: '#ff4d4f' }} />异常监控<Badge count={data.anomalyGuilds.length} /></Space>}
          size="small" style={{ marginTop: 16 }}
        >
          <Table
            columns={[
              { title: '公会', dataIndex: 'name', key: 'name' },
              { title: '异常原因', dataIndex: 'reason', key: 'reason', render: (v: string) => <Tag color="red">{v}</Tag> },
            ]}
            dataSource={data.anomalyGuilds}
            rowKey="id"
            size="small"
            pagination={false}
          />
        </Card>
      )}
    </div>
  );
}

// ===== 模块二：公会管理员控制台 =====

function GuildDashboard() {
  const { currentGuildId } = useGuildStore();
  const navigate = useNavigate();
  const guildId = currentGuildId!;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await request.get(`/guild/${guildId}/dashboard/overview`);
      setData(res);
    } catch {} finally { setLoading(false); }
  }, [guildId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res: any = await request.post(`/guild/${guildId}/dashboard/sync-members`);
      if (res?.success) {
        message.success(`同步完成：新增 ${res.added}，更新 ${res.updated}，离开 ${res.left}`);
        fetchData();
      } else {
        message.warning(res?.message || '同步失败，请检查公会是否已配置 Bot Token');
      }
    } catch (err: any) {
      const errMsg = err?.message || err?.response?.data?.message || '同步请求失败';
      message.error(`同步失败：${errMsg}`);
    } finally { setSyncing(false); }
  };

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const newMemberColumns = [
    { title: '#', key: '_index', width: 40, render: (_: any, __: any, i: number) => i + 1 },
    { title: '成员昵称', dataIndex: 'nickname', key: 'nickname' },
    {
      title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt', width: 120,
      render: (v: string) => v ? (
        <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(v).format('MM-DD HH:mm')}
        </Tooltip>
      ) : '-',
    },
  ];

  const leftMemberColumns = [
    { title: '#', key: '_index', width: 40, render: (_: any, __: any, i: number) => i + 1 },
    { title: '成员昵称', dataIndex: 'nickname', key: 'nickname' },
    {
      title: '离开时间', dataIndex: 'leftAt', key: 'leftAt', width: 120,
      render: (v: string) => v ? (
        <Tooltip title={dayjs(v).format('YYYY-MM-DD HH:mm:ss')}>
          {dayjs(v).format('MM-DD HH:mm')}
        </Tooltip>
      ) : '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>控制台</Title>
        <Space>
          <Button icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={handleSync}>
            立即同步成员
          </Button>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>

      {/* A. 核心数据卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => navigate('/admin/members')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><TeamOutlined /> 成员总数</Space>}
              value={data.totalActive}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => navigate('/admin/equipment')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><AppstoreOutlined /> 装备总数</Space>}
              value={data.totalInventory}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable onClick={() => navigate('/admin/resupply')} style={{ cursor: 'pointer' }}>
            <Statistic
              title={<Space><SyncOutlined /> 待处理补装申请</Space>}
              value={data.pendingResupply}
              valueStyle={{ color: data.pendingResupply > 0 ? '#ff4d4f' : '#8c8c8c' }}
            />
            {data.pendingResupply > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>点击卡片跳转至审核列表</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* B. 成员变动快照 */}
      <Card
        style={{ marginTop: 16 }}
        title={
          <Space>
            <TeamOutlined />
            <Text strong>成员流动监控</Text>
          </Space>
        }
        extra={
          <Space>
            <ClockCircleOutlined style={{ color: '#999' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              最近一次统计时间：{data.lastSyncedAt ? dayjs(data.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss') : '尚未同步'}
            </Text>
          </Space>
        }
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Card
              type="inner"
              size="small"
              title={
                <Space>
                  <PlusCircleOutlined style={{ color: '#52c41a' }} />
                  <Text>新增成员</Text>
                  <Tag color="blue">{data.dailyNew} 人</Tag>
                </Space>
              }
            >
              <Table
                columns={newMemberColumns}
                dataSource={data.newMembers || []}
                rowKey="id"
                size="small"
                pagination={false}
                locale={{ emptyText: '今日无新增成员' }}
              />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              type="inner"
              size="small"
              title={
                <Space>
                  <MinusCircleOutlined style={{ color: '#ff4d4f' }} />
                  <Text>离开成员</Text>
                  <Tag color="red">{data.dailyLeft} 人</Tag>
                </Space>
              }
            >
              <Table
                columns={leftMemberColumns}
                dataSource={data.leftMembers || []}
                rowKey="id"
                size="small"
                pagination={false}
                locale={{ emptyText: '今日无离开成员' }}
              />
            </Card>
          </Col>
        </Row>
      </Card>

    </div>
  );
}

// ===== 主入口 =====

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isSSVIP = user?.globalRole === 'ssvip';

  return isSSVIP ? <AdminDashboard /> : <GuildDashboard />;
}

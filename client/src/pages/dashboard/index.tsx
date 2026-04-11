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
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

// ===== 模块一：系统超管控制台 =====

function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await request.get('/admin/dashboard');
      setData(res);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const recentGuildColumns = [
    { title: '公会名称', dataIndex: 'name', key: 'name', render: (v: string) => <Text strong>{v}</Text> },
    { title: '管理员', dataIndex: 'ownerName', key: 'ownerName' },
    { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
  ];

  const anomalyColumns = [
    { title: '公会', dataIndex: 'name', key: 'name' },
    { title: '异常原因', dataIndex: 'reason', key: 'reason', render: (v: string) => <Tag color="red">{v}</Tag> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>系统超管控制台</Title>
        <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title={<Space><BankOutlined /> 公会总数</Space>}
              value={data.totalGuilds}
              valueStyle={{ color: '#1677ff', fontSize: 32 }}
              suffix={
                data.guildsTrend !== 0 && (
                  <Text style={{ fontSize: 14, color: data.guildsTrend > 0 ? '#52c41a' : '#ff4d4f' }}>
                    {data.guildsTrend > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    {' '}较昨日 {data.guildsTrend > 0 ? '+' : ''}{data.guildsTrend}
                  </Text>
                )
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title={<Space><UserOutlined /> 注册用户数</Space>}
              value={data.totalUsers}
              valueStyle={{ color: '#722ed1', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title={<Space><RobotOutlined /> 活跃机器人</Space>}
              value={data.activeBots}
              valueStyle={{ color: '#52c41a', fontSize: 32 }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title={<Space><KeyOutlined /> 今日核销邀请码</Space>}
              value={data.todayRedeemed}
              valueStyle={{ color: '#faad14', fontSize: 32 }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="最新入驻公会" size="small">
            <Table
              columns={recentGuildColumns}
              dataSource={data.recentGuilds || []}
              rowKey="id"
              size="small"
              pagination={false}
              locale={{ emptyText: '暂无公会入驻' }}
            />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card
            title={
              <Space>
                <WarningOutlined style={{ color: '#ff4d4f' }} />
                异常监控
                {data.anomalyGuilds?.length > 0 && <Badge count={data.anomalyGuilds.length} />}
              </Space>
            }
            size="small"
          >
            {data.anomalyGuilds?.length > 0 ? (
              <Table
                columns={anomalyColumns}
                dataSource={data.anomalyGuilds}
                rowKey="id"
                size="small"
                pagination={false}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                <Tag color="green">所有公会运行正常</Tag>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ===== 模块二：公会管理员控制台 =====

function GuildDashboard() {
  const { currentGuildId } = useGuildStore();
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
        message.warning(res?.message || '同步失败');
      }
    } catch {
      message.error('同步请求失败');
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
          <Card hoverable>
            <Statistic
              title={<Space><TeamOutlined /> 成员总数</Space>}
              value={data.totalActive}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable>
            <Statistic
              title={<Space><AppstoreOutlined /> 装备总数</Space>}
              value={data.totalInventory}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card hoverable style={{ cursor: 'pointer' }}>
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

import { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Spin, Tag } from 'antd';
import { TeamOutlined, AppstoreOutlined, SyncOutlined, BankOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { useAuthStore } from '@/stores/auth.store';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { currentGuildId } = useGuildStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [guildCount, setGuildCount] = useState<number>(0);

  const isSSVIP = user?.globalRole === 'ssvip';

  useEffect(() => {
    if (isSSVIP) {
      request.get('/guilds/all').then((res: any) => {
        setGuildCount(Array.isArray(res) ? res.length : 0);
      }).catch(() => {});
      return;
    }
    if (!currentGuildId) return;
    setLoading(true);
    request.get(`/api/guild/${currentGuildId}/dashboard/overview`).then((res: any) => {
      setData(res);
    }).finally(() => setLoading(false));
  }, [currentGuildId, isSSVIP]);

  if (isSSVIP) {
    return (
      <div>
        <Title level={4}>SSVIP 控制台</Title>
        <Card>
          <Statistic
            title="当前使用公会数"
            value={guildCount}
            prefix={<BankOutlined />}
            valueStyle={{ color: '#faad14', fontSize: 36 }}
          />
        </Card>
      </div>
    );
  }

  if (loading || !data) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const today = dayjs().format('YYYY-MM-DD');

  const newMemberColumns = [
    { title: '#', dataIndex: '_index', key: '_index', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '成员昵称', dataIndex: 'nickname', key: 'nickname' },
    { title: '加入时间', dataIndex: 'joinedAt', key: 'joinedAt', render: (v: string) => v ? dayjs(v).format('HH:mm:ss') : '-' },
  ];

  const leftMemberColumns = [
    { title: '#', dataIndex: '_index', key: '_index', width: 50, render: (_: any, __: any, i: number) => i + 1 },
    { title: '成员昵称', dataIndex: 'nickname', key: 'nickname' },
    { title: '离开时间', dataIndex: 'leftAt', key: 'leftAt', render: (v: string) => v ? dayjs(v).format('HH:mm:ss') : '-' },
  ];

  return (
    <div>
      <Title level={4}>控制台</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="在会成员"
              value={data.totalActive}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="库存装备总数"
              value={data.totalInventory}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic
              title="待处理补装申请"
              value={data.pendingResupply}
              prefix={<SyncOutlined />}
              valueStyle={{ color: data.pendingResupply > 0 ? '#ff4d4f' : '#8c8c8c' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card
            title={<span>新增成员 <Tag color="blue">{data.dailyNew} 人</Tag></span>}
            size="small"
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
            title={<span>离开成员 <Tag color="red">{data.dailyLeft} 人</Tag></span>}
            size="small"
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

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Text type="secondary">
          统计时间：{today}
        </Text>
      </div>
    </div>
  );
}

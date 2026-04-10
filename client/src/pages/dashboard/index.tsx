import { useState, useEffect } from 'react';
import { Card, Typography, Row, Col, Statistic, Table, Tag, Space, Spin } from 'antd';
import { TeamOutlined, AppstoreOutlined, SyncOutlined, AlertOutlined, UserAddOutlined, UserDeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function DashboardPage() {
  const { currentGuildId } = useGuildStore();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentGuildId) return;
    setLoading(true);
    request.get(`/guild/${currentGuildId}/dashboard/overview`)
      .then((res: any) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentGuildId]);

  const memberColumns = [
    { title: '昵称', dataIndex: 'nickname', key: 'nick' },
    { title: 'KOOK ID', dataIndex: 'kookUserId', key: 'kookId', ellipsis: true },
  ];

  return (
    <Spin spinning={loading}>
      <Title level={4}>控制台</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="在会成员" value={data?.totalActive || 0} prefix={<TeamOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="库存总量" value={data?.totalInventory || 0} prefix={<AppstoreOutlined />} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="待处理补装" value={data?.pendingResupply || 0} prefix={<SyncOutlined />} valueStyle={data?.pendingResupply > 0 ? { color: '#faad14' } : {}} /></Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card><Statistic title="未解决预警" value={data?.unresolvedAlerts || 0} prefix={<AlertOutlined />} valueStyle={data?.unresolvedAlerts > 0 ? { color: '#cf1322' } : {}} /></Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title={<Space><UserAddOutlined style={{ color: '#52c41a' }} /><span>新增成员 ({data?.dailyNew || 0})</span></Space>} size="small">
            <Table size="small" dataSource={data?.newMembers || []} columns={[
              ...memberColumns,
              { title: '加入时间', dataIndex: 'joinedAt', key: 'time', render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
            ]} rowKey="id" pagination={false} locale={{ emptyText: '近24小时无新增' }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={<Space><UserDeleteOutlined style={{ color: '#ff4d4f' }} /><span>离开成员 ({data?.dailyLeft || 0})</span></Space>} size="small">
            <Table size="small" dataSource={data?.leftMembers || []} columns={[
              ...memberColumns,
              { title: '离开时间', dataIndex: 'leftAt', key: 'time', render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-' },
            ]} rowKey="id" pagination={false} locale={{ emptyText: '近24小时无离开' }} />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginTop: 16 }}>
        <Space>
          <ClockCircleOutlined />
          <Text type="secondary">
            统计时间（上次获取KOOK成员）：{data?.lastSyncedAt ? dayjs(data.lastSyncedAt).format('YYYY-MM-DD HH:mm:ss') : '暂无同步记录'}
          </Text>
        </Space>
      </Card>
    </Spin>
  );
}

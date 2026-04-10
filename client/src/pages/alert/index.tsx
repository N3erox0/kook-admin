import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Form, Input, InputNumber, Switch, Tabs, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import request from '@/api/request';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function AlertPage() {
  const { currentGuildId } = useGuildStore();
  const [activeTab, setActiveTab] = useState('01');
  const [rules, setRules] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchRules = () => {
    if (!currentGuildId) return;
    setLoading(true);
    request.get(`/api/guild/${currentGuildId}/alerts/rules`, { params: { ruleType: activeTab } }).then((res: any) => {
      setRules(Array.isArray(res) ? res : res?.list || []);
    }).finally(() => setLoading(false));
  };

  const fetchRecords = () => {
    if (!currentGuildId) return;
    request.get(`/api/guild/${currentGuildId}/alerts/records`, { params: { alertType: activeTab === '01' ? 'below' : 'death' } }).then((res: any) => {
      setRecords(Array.isArray(res) ? res : res?.list || []);
    });
  };

  useEffect(() => { fetchRules(); fetchRecords(); }, [currentGuildId, activeTab]);

  const handleCreate = async (values: any) => {
    try {
      await request.post(`/api/guild/${currentGuildId}/alerts/rules`, {
        ...values,
        ruleType: activeTab,
        enabled: true,
      });
      message.success('规则创建成功');
      setModalOpen(false);
      form.resetFields();
      fetchRules();
    } catch {}
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await request.put(`/api/guild/${currentGuildId}/alerts/rules/${id}`, { enabled });
      message.success('状态已更新');
      fetchRules();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await request.delete(`/api/guild/${currentGuildId}/alerts/rules/${id}`);
      message.success('规则已删除');
      fetchRules();
    } catch {}
  };

  const handleResolve = async (id: number) => {
    try {
      await request.put(`/api/guild/${currentGuildId}/alerts/records/${id}/resolve`);
      message.success('已标记解决');
      fetchRecords();
    } catch {}
  };

  // 库存预警规则列表列
  const inventoryRuleColumns: any[] = [
    { title: '规则名称', dataIndex: 'ruleName', key: 'ruleName' },
    { title: '装备名称', dataIndex: 'equipmentName', key: 'equipmentName', render: (v: string) => v || '全部' },
    { title: '装等范围', dataIndex: 'gearScoreValue', key: 'gearScoreValue', render: (v: string) => v || '-' },
    { title: '阈值', dataIndex: 'threshold', key: 'threshold', render: (v: number) => <Tag color="orange">低于 {v}</Tag> },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (v: boolean, record: any) => <Switch checked={v} size="small" onChange={(c) => handleToggle(record.id, c)} />,
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  // 死亡次数预警规则列表列
  const deathRuleColumns: any[] = [
    { title: '规则名称', dataIndex: 'ruleName', key: 'ruleName' },
    { title: '装等', dataIndex: 'gearScoreValue', key: 'gearScoreValue', render: (v: string) => v || '全部' },
    { title: '次数阈值', dataIndex: 'threshold', key: 'threshold', render: (v: number) => <Tag color="red">≥ {v} 次</Tag> },
    {
      title: '启用', dataIndex: 'enabled', key: 'enabled', width: 80,
      render: (v: boolean, record: any) => <Switch checked={v} size="small" onChange={(c) => handleToggle(record.id, c)} />,
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => (
        <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const recordColumns: any[] = [
    { title: '预警信息', dataIndex: 'message', key: 'message', ellipsis: true },
    { title: '当前值', dataIndex: 'currentValue', key: 'currentValue', width: 80 },
    { title: '阈值', dataIndex: 'thresholdValue', key: 'thresholdValue', width: 80 },
    {
      title: '状态', dataIndex: 'isResolved', key: 'isResolved', width: 80,
      render: (v: number) => v ? <Tag color="green">已解决</Tag> : <Tag color="red">未解决</Tag>,
    },
    { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 150, render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: any, record: any) => !record.isResolved && (
        <Button type="link" size="small" onClick={() => handleResolve(record.id)}>解决</Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: '01',
      label: '库存预警',
      children: (
        <div>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>新增规则</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchRules}>刷新</Button>
          </Space>
          <Title level={5}>预警规则</Title>
          <Table columns={inventoryRuleColumns} dataSource={rules} rowKey="id" loading={loading} size="small" pagination={false} />
          <Title level={5} style={{ marginTop: 24 }}>预警记录</Title>
          <Table columns={recordColumns} dataSource={records} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        </div>
      ),
    },
    {
      key: '02',
      label: '死亡次数提醒',
      children: (
        <div>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }}>新增规则</Button>
            <Button icon={<ReloadOutlined />} onClick={fetchRules}>刷新</Button>
          </Space>
          <Title level={5}>预警规则</Title>
          <Table columns={deathRuleColumns} dataSource={rules} rowKey="id" loading={loading} size="small" pagination={false} />
          <Title level={5} style={{ marginTop: 24 }}>预警记录</Title>
          <Table columns={recordColumns} dataSource={records} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={4}>预警设置</Title>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <Modal
        title={activeTab === '01' ? '新增库存预警规则' : '新增死亡次数提醒规则'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="如：武器库存不足预警" />
          </Form.Item>
          {activeTab === '01' && (
            <Form.Item name="equipmentName" label="装备名称（留空表示全部）">
              <Input placeholder="如：长剑" />
            </Form.Item>
          )}
          <Form.Item name="gearScoreValue" label="装等（如 P4、P8、P4-P8）">
            <Input placeholder="如：P8 或 P4-P8" />
          </Form.Item>
          <Form.Item name="threshold" label={activeTab === '01' ? '库存阈值（低于此值预警）' : '死亡次数（达到此值提醒）'} rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

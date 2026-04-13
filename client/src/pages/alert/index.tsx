import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Tabs } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined } from '@ant-design/icons';
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertRecords, resolveAlertRecord } from '@/api/alert';
import { useGuildStore } from '@/stores/guild.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const RULE_TYPES = [
  { value: '01', label: '补装库存预警' },
  { value: '02', label: '死亡次数预警' },
];

export default function AlertPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;

  // 规则列表
  const [rules, setRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  // 记录列表
  const [records, setRecords] = useState<any[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordFilter, setRecordFilter] = useState<string | undefined>(undefined);

  // 规则弹窗
  const [ruleModal, setRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [ruleForm] = Form.useForm();

  const fetchRules = async () => {
    if (!guildId) return;
    setRulesLoading(true);
    try {
      const res: any = await getAlertRules(guildId);
      setRules(Array.isArray(res) ? res : []);
    } catch {} finally { setRulesLoading(false); }
  };

  const fetchRecords = async (p = recordsPage) => {
    if (!guildId) return;
    setRecordsLoading(true);
    try {
      const params: any = { page: p, pageSize: 20 };
      if (recordFilter) params.alertType = recordFilter;
      const res: any = await getAlertRecords(guildId, params);
      setRecords(res?.list || []);
      setRecordsTotal(res?.total || 0);
    } catch {} finally { setRecordsLoading(false); }
  };

  useEffect(() => { fetchRules(); fetchRecords(1); }, [guildId]);

  const handleSaveRule = async (values: any) => {
    try {
      if (editingRule) {
        await updateAlertRule(guildId, editingRule.id, values);
        message.success('规则已更新');
      } else {
        await createAlertRule(guildId, values);
        message.success('规则已创建');
      }
      setRuleModal(false);
      ruleForm.resetFields();
      setEditingRule(null);
      fetchRules();
    } catch {}
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await deleteAlertRule(guildId, id);
      message.success('规则已删除');
      fetchRules();
    } catch {}
  };

  const handleResolve = async (id: number) => {
    try {
      await resolveAlertRecord(guildId, id);
      message.success('已标记为已解决');
      fetchRecords();
    } catch {}
  };

  const openEditRule = (rule: any) => {
    setEditingRule(rule);
    ruleForm.setFieldsValue(rule);
    setRuleModal(true);
  };

  const ruleColumns: any[] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '类型', dataIndex: 'ruleType', width: 130,
      render: (v: string) => <Tag color={v === '01' ? 'blue' : 'orange'}>
        {v === '01' ? '库存预警' : '死亡次数预警'}
      </Tag>,
    },
    { title: '规则名称', dataIndex: 'ruleName' },
    { title: '装备名', dataIndex: 'equipmentName', width: 120, render: (v: string) => v || '全部' },
    { title: '装等', dataIndex: 'gearScoreValue', width: 80, render: (v: string) => v || '-' },
    { title: '阈值', dataIndex: 'threshold', width: 80 },
    {
      title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: number) => v ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>,
    },
    {
      title: '操作', key: 'actions', width: 140,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditRule(r)}>编辑</Button>
          <Popconfirm title="确认删除该规则？" onConfirm={() => handleDeleteRule(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const recordColumns: any[] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '类型', dataIndex: 'alertType', width: 110,
      render: (v: string) => <Tag color={v === 'inventory' ? 'blue' : 'orange'}>
        {v === 'inventory' ? '库存预警' : v === 'death_count' ? '死亡预警' : v}
      </Tag>,
    },
    { title: '预警内容', dataIndex: 'message', ellipsis: true },
    { title: '当前值', dataIndex: 'currentValue', width: 80 },
    { title: '阈值', dataIndex: 'thresholdValue', width: 80 },
    {
      title: '状态', dataIndex: 'isResolved', width: 90,
      render: (v: number) => v ? <Tag color="green">已解决</Tag> : <Tag color="red">未解决</Tag>,
    },
    {
      title: '时间', dataIndex: 'createdAt', width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, r: any) => !r.isResolved ? (
        <Popconfirm title="标记为已解决？" onConfirm={() => handleResolve(r.id)}>
          <Button size="small" type="link" icon={<CheckCircleOutlined />}>解决</Button>
        </Popconfirm>
      ) : <Text type="secondary" style={{ fontSize: 12 }}>
        {r.resolvedAt ? dayjs(r.resolvedAt).format('MM-DD HH:mm') : ''}
      </Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>预警设置</Title>
      </div>

      <Tabs defaultActiveKey="rules" items={[
        {
          key: 'rules',
          label: `预警规则 (${rules.length})`,
          children: (
            <Card>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Text type="secondary">配置库存预警和死亡次数预警规则，系统每天自动执行扫描（05:00库存/06:00死亡）并推送KOOK通知</Text>
                <Space>
                  <Button icon={<ReloadOutlined />} onClick={fetchRules}>刷新</Button>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => {
                    setEditingRule(null);
                    ruleForm.resetFields();
                    setRuleModal(true);
                  }}>新增规则</Button>
                </Space>
              </div>
              <Table columns={ruleColumns} dataSource={rules} rowKey="id" loading={rulesLoading} size="small" pagination={false} />
            </Card>
          ),
        },
        {
          key: 'records',
          label: `预警记录 (${recordsTotal})`,
          children: (
            <Card>
              <Space style={{ marginBottom: 16 }}>
                <Select placeholder="类型筛选" allowClear style={{ width: 150 }} value={recordFilter}
                  onChange={v => { setRecordFilter(v); setRecordsPage(1); setTimeout(() => fetchRecords(1), 0); }}>
                  <Select.Option value="inventory">库存预警</Select.Option>
                  <Select.Option value="death_count">死亡预警</Select.Option>
                </Select>
                <Button icon={<ReloadOutlined />} onClick={() => fetchRecords()}>刷新</Button>
              </Space>
              <Table columns={recordColumns} dataSource={records} rowKey="id" loading={recordsLoading} size="small"
                pagination={{ current: recordsPage, total: recordsTotal, pageSize: 20,
                  showTotal: t => `共 ${t} 条`, onChange: p => { setRecordsPage(p); fetchRecords(p); } }} />
            </Card>
          ),
        },
      ]} />

      {/* 新增/编辑规则弹窗 */}
      <Modal
        title={editingRule ? '编辑预警规则' : '新增预警规则'}
        open={ruleModal}
        onCancel={() => { setRuleModal(false); setEditingRule(null); }}
        footer={null}
        destroyOnClose
      >
        <Form form={ruleForm} onFinish={handleSaveRule} layout="vertical"
          initialValues={{ ruleType: '01', threshold: 5, enabled: 1 }}>
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select options={RULE_TYPES} />
          </Form.Item>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="如：P9武器库存低于5" />
          </Form.Item>
          <Form.Item name="equipmentName" label="装备名称（可选，留空=全部）">
            <Input placeholder="如：堕神之刃" />
          </Form.Item>
          <Form.Item name="gearScoreValue" label="装等范围（如 P8、P4-P8）">
            <Input placeholder="如 P9、P4-P8" />
          </Form.Item>
          <Form.Item name="threshold" label="阈值" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="状态">
            <Select>
              <Select.Option value={1}>启用</Select.Option>
              <Select.Option value={0}>禁用</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              {editingRule ? '保存修改' : '创建规则'}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

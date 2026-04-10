import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Form, Input, InputNumber, Select, Popconfirm, Tabs, Switch, Badge } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EditOutlined, CheckOutlined, AlertOutlined } from '@ant-design/icons';
import { getAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, getAlertRecords, resolveAlertRecord } from '@/api/alert';
import { useGuildStore } from '@/stores/guild.store';
import { ALERT_RULE_TYPE } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export default function AlertPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;

  // 规则
  const [rules, setRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [ruleModal, setRuleModal] = useState(false);
  const [editRule, setEditRule] = useState<any>(null);
  const [ruleForm] = Form.useForm();

  // 记录
  const [records, setRecords] = useState<any[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);
  const [resolvedFilter, setResolvedFilter] = useState<number | undefined>(0);

  const fetchRules = async () => {
    if (!guildId) return;
    setRulesLoading(true);
    try { const res: any = await getAlertRules(guildId); setRules(res || []); } catch {} finally { setRulesLoading(false); }
  };

  const fetchRecords = async (p = recordsPage) => {
    if (!guildId) return;
    setRecordsLoading(true);
    try {
      const res: any = await getAlertRecords(guildId, { page: p, pageSize: 20, isResolved: resolvedFilter });
      setRecords(res?.list || []);
      setRecordsTotal(res?.total || 0);
    } catch {} finally { setRecordsLoading(false); }
  };

  useEffect(() => { fetchRules(); fetchRecords(1); }, [guildId]);
  useEffect(() => { setRecordsPage(1); fetchRecords(1); }, [resolvedFilter]);

  const openRuleModal = (rule?: any) => {
    setEditRule(rule || null);
    if (rule) ruleForm.setFieldsValue(rule);
    else ruleForm.resetFields();
    setRuleModal(true);
  };

  const handleRuleSave = async (values: any) => {
    try {
      if (editRule) {
        await updateAlertRule(guildId, editRule.id, values);
        message.success('规则已更新');
      } else {
        await createAlertRule(guildId, values);
        message.success('规则已创建');
      }
      setRuleModal(false);
      fetchRules();
    } catch {}
  };

  const handleDeleteRule = async (id: number) => {
    try { await deleteAlertRule(guildId, id); message.success('已删除'); fetchRules(); } catch {}
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try { await updateAlertRule(guildId, id, { enabled: enabled ? 1 : 0 }); fetchRules(); } catch {}
  };

  const handleResolve = async (id: number) => {
    try { await resolveAlertRecord(guildId, id); message.success('已标记解决'); fetchRecords(); } catch {}
  };

  const ruleColumns = [
    {
      title: '类型', dataIndex: 'ruleType', key: 'type', width: 120,
      render: (v: string) => <Tag color={v === '01' ? 'blue' : 'volcano'}>{ALERT_RULE_TYPE[v] || v}</Tag>,
    },
    { title: '规则名称', dataIndex: 'ruleName', key: 'name', ellipsis: true },
    { title: '装备名称', dataIndex: 'equipmentName', key: 'equip', render: (v: string) => v || '全部' },
    { title: '装等', dataIndex: 'gearScoreValue', key: 'gs', width: 80, render: (v: string) => v || '-' },
    { title: '阈值', dataIndex: 'threshold', key: 'th', width: 80, render: (v: number) => <Text strong>{v}</Text> },
    {
      title: '状态', key: 'enabled', width: 80,
      render: (_: any, r: any) => <Switch size="small" checked={r.enabled === 1} onChange={(v) => handleToggleRule(r.id, v)} />,
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openRuleModal(r)}>编辑</Button>
          <Popconfirm title="删除规则？" onConfirm={() => handleDeleteRule(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const recordColumns = [
    {
      title: '类型', dataIndex: 'alertType', key: 'type', width: 110,
      render: (v: string) => <Tag color={v === 'death_count' ? 'volcano' : 'blue'}>{v === 'death_count' ? '死亡次数' : '库存预警'}</Tag>,
    },
    { title: '预警内容', dataIndex: 'message', key: 'msg', ellipsis: true },
    {
      title: '当前值/阈值', key: 'values', width: 120,
      render: (_: any, r: any) => <Text type="danger">{r.currentValue}</Text>,
    },
    {
      title: '状态', key: 'resolved', width: 90,
      render: (_: any, r: any) => r.isResolved ? <Tag color="green">已解决</Tag> : <Tag color="red">未解决</Tag>,
    },
    {
      title: '时间', dataIndex: 'createdAt', key: 'time', width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 80,
      render: (_: any, r: any) => !r.isResolved ? (
        <Popconfirm title="标记为已解决？" onConfirm={() => handleResolve(r.id)}>
          <Button size="small" type="link" icon={<CheckOutlined />}>解决</Button>
        </Popconfirm>
      ) : null,
    },
  ];

  const unresolvedCount = records.filter(r => !r.isResolved).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>预警系统</Title>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchRules(); fetchRecords(); }}>刷新</Button>
      </div>

      <Tabs defaultActiveKey="rules" items={[
        {
          key: 'rules',
          label: '预警规则',
          children: (
            <>
              <div style={{ marginBottom: 12, textAlign: 'right' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openRuleModal()}>新增规则</Button>
              </div>
              <Table columns={ruleColumns} dataSource={rules} rowKey="id" loading={rulesLoading} size="middle" pagination={false} />
            </>
          ),
        },
        {
          key: 'records',
          label: <Badge count={unresolvedCount} offset={[10, 0]}>预警记录</Badge>,
          children: (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Select value={resolvedFilter} onChange={setResolvedFilter} style={{ width: 120 }} allowClear placeholder="状态">
                  <Select.Option value={0}>未解决</Select.Option>
                  <Select.Option value={1}>已解决</Select.Option>
                </Select>
              </Space>
              <Table columns={recordColumns} dataSource={records} rowKey="id" loading={recordsLoading} size="middle"
                pagination={{ current: recordsPage, total: recordsTotal, pageSize: 20, showTotal: t => `共 ${t} 条`,
                  onChange: p => { setRecordsPage(p); fetchRecords(p); } }} />
            </>
          ),
        },
      ]} />

      {/* 规则弹窗 */}
      <Modal title={editRule ? '编辑预警规则' : '新增预警规则'} open={ruleModal} onCancel={() => setRuleModal(false)} footer={null} destroyOnClose>
        <Form form={ruleForm} onFinish={handleRuleSave} layout="vertical" initialValues={{ ruleType: '01', threshold: 50 }}>
          <Form.Item name="ruleType" label="规则类型" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="01">01 - 补装库存预警</Select.Option>
              <Select.Option value="02">02 - 死亡次数预警</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="ruleName" label="规则名称" rules={[{ required: true }]}><Input placeholder="如: P8堕神库存预警" /></Form.Item>
          <Form.Item name="equipmentName" label="装备名称（可选）"><Input placeholder="留空=全部装备" /></Form.Item>
          <Form.Item name="gearScoreValue" label="装等（如 P8、P4-P8、P9、P12）"><Input placeholder="如 P8 或 P4-P8" /></Form.Item>
          <Form.Item name="threshold" label="阈值（库存低于/死亡次数≥此值触发）" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>保存</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

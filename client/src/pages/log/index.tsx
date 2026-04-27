import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, Select, Tabs } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import request from '@/api/request';
import { useGuildStore } from '@/stores/guild.store';
import { useAuthStore } from '@/stores/auth.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const MODULE_LABELS: Record<string, string> = {
  equipment: '装备库存', catalog: '装备参考库', resupply: '补装管理',
  ocr: 'OCR识别', alert: '预警', member: '成员', guild: '公会', auth: '认证',
};

const ACTION_LABELS: Record<string, string> = {
  create: '新增', update: '更新', delete: '删除', upsert: '录入', batch_upsert: '批量导入',
  csv_import: 'CSV导入', process: '审批', batch_process: '批量审批',
  recognize: 'OCR识别', save_to_inventory: '入库', create_batch: '创建批次',
};

export default function LogPage() {
  const { currentGuildId } = useGuildStore();
  const { user } = useAuthStore();
  const isSSVIP = user?.globalRole === 'ssvip';
  const guildId = currentGuildId;
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState<string | undefined>();
  const [modules, setModules] = useState<string[]>([]);

  // 推送记录
  const [pushLogs, setPushLogs] = useState<any[]>([]);
  const [pushTotal, setPushTotal] = useState(0);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushPage, setPushPage] = useState(1);

  const basePath = isSSVIP ? '/admin/logs' : (guildId ? `/guild/${guildId}/logs` : '/admin/logs');

  const fetchLogs = async (p = page) => {
    setLoading(true);
    try {
      const res: any = await request.get(basePath, { params: { page: p, pageSize: 30, module: moduleFilter } });
      setLogs(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  const fetchModules = async () => {
    try {
      const res: any = await request.get(`${basePath}/modules`);
      setModules(res || []);
    } catch {}
  };

  const fetchPushLogs = async () => {
    setPushLoading(true);
    try {
      const res: any = await request.get(`${basePath}/scheduled-tasks`);
      setPushLogs(Array.isArray(res) ? res : []);
      setPushTotal(Array.isArray(res) ? res.length : 0);
    } catch {} finally { setPushLoading(false); }
  };

  useEffect(() => { fetchLogs(1); fetchModules(); fetchPushLogs(); }, []);
  useEffect(() => { setPage(1); fetchLogs(1); }, [moduleFilter]);

  const columns = [
    { title: '时间', dataIndex: 'createdAt', key: 'time', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss') },
    { title: '操作人', dataIndex: 'username', key: 'user', width: 100 },
    {
      title: '模块', dataIndex: 'module', key: 'module', width: 110,
      render: (v: string) => <Tag>{MODULE_LABELS[v] || v}</Tag>,
    },
    {
      title: '操作', dataIndex: 'action', key: 'action', width: 100,
      render: (v: string) => ACTION_LABELS[v] || v,
    },
    { title: 'IP', dataIndex: 'ipAddress', key: 'ip', width: 130 },
    {
      title: '状态', dataIndex: 'responseStatus', key: 'status', width: 80,
      render: (v: number) => v >= 200 && v < 400 ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>操作日志</Title>
        <Button icon={<ReloadOutlined />} onClick={() => { fetchLogs(); fetchPushLogs(); }}>刷新</Button>
      </div>

      <Tabs defaultActiveKey="operations" items={[
        {
          key: 'operations',
          label: '操作日志',
          children: (
            <>
              <Space style={{ marginBottom: 12 }}>
                <Select placeholder="模块" allowClear style={{ width: 140 }} value={moduleFilter} onChange={setModuleFilter}>
                  {modules.map(m => <Select.Option key={m} value={m}>{MODULE_LABELS[m] || m}</Select.Option>)}
                </Select>
              </Space>
              <Table columns={columns} dataSource={logs} rowKey="id" loading={loading} size="middle"
                pagination={{ current: page, total, pageSize: 30, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchLogs(p); } }} />
            </>
          ),
        },
        {
          key: 'push',
          label: '消息推送记录',
          children: (
            <Table
              dataSource={pushLogs}
              rowKey="id"
              loading={pushLoading}
              size="middle"
              pagination={false}
              columns={[
                { title: '任务名', dataIndex: 'taskName', key: 'name', width: 200,
                  render: (v: string) => {
                    const labels: Record<string, string> = {
                      'kook_member_sync': 'KOOK成员同步',
                      'inventory_alert': '库存预警推送',
                      'death_count_alert': '死亡次数预警',
                      'resupply_reaction': '补装回应表情',
                    };
                    return <Tag color="blue">{labels[v] || v}</Tag>;
                  },
                },
                { title: '上次执行', dataIndex: 'lastRunAt', key: 'lastRun', width: 170,
                  render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
                },
                { title: '执行结果', dataIndex: 'lastRunResult', key: 'result' },
                { title: '耗时(ms)', dataIndex: 'durationMs', key: 'duration', width: 100,
                  render: (v: number) => v ? `${v}ms` : '-',
                },
                { title: '状态', dataIndex: 'status', key: 'status', width: 80,
                  render: (v: number) => v ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
                },
              ]}
            />
          ),
        },
      ]} />
    </div>
  );
}

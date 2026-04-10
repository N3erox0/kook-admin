import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Popconfirm, AutoComplete, Upload, Timeline, Drawer } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined, SearchOutlined, DeleteOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import { getInventoryList, upsertInventory, batchUpsertInventory, updateInventoryFields, deleteInventory, getInventoryLogs } from '@/api/equipment';
import { searchCatalog } from '@/api/catalog';
import { useGuildStore } from '@/stores/guild.store';
import { CATEGORIES, QUALITY_LABELS } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const QUALITY_COLORS = ['default', 'success', 'processing', 'purple', 'warning'];

export default function EquipmentPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<any>({});

  // 新增/编辑弹窗
  const [upsertModal, setUpsertModal] = useState(false);
  const [catalogOptions, setCatalogOptions] = useState<any[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<number | null>(null);
  const [upsertForm] = Form.useForm();

  // 编辑弹窗
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm] = Form.useForm();

  // Excel 导入
  const [excelModal, setExcelModal] = useState(false);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelImporting, setExcelImporting] = useState(false);

  // 变动日志
  const [logDrawer, setLogDrawer] = useState(false);
  const [logTarget, setLogTarget] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchList = async (p = page, f = filters) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getInventoryList(guildId, { ...f, page: p, pageSize: 50 });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, [guildId]);

  const handleSearch = (values: any) => {
    const f = { ...values };
    Object.keys(f).forEach(k => { if (f[k] === undefined || f[k] === '') delete f[k]; });
    setFilters(f);
    setPage(1);
    fetchList(1, f);
  };

  // 搜索装备参考库（下拉）
  const handleCatalogSearch = async (keyword: string) => {
    if (!keyword || keyword.length < 1) { setCatalogOptions([]); return; }
    try {
      const res: any = await searchCatalog(keyword);
      setCatalogOptions((res || []).map((item: any) => ({
        value: item.name,
        label: `${item.name} Lv.${item.level} Q${item.quality} ${item.category} (P${item.gearScore})`,
        item,
      })));
    } catch { setCatalogOptions([]); }
  };

  const handleCatalogSelect = (_: string, option: any) => {
    setSelectedCatalogId(option.item.id);
    upsertForm.setFieldsValue({ catalogId: option.item.id });
  };

  const handleUpsert = async (values: any) => {
    if (!selectedCatalogId) { message.error('请从下拉列表选择装备'); return; }
    try {
      await upsertInventory(guildId, { ...values, catalogId: selectedCatalogId });
      message.success('保存成功');
      setUpsertModal(false);
      upsertForm.resetFields();
      setSelectedCatalogId(null);
      fetchList();
    } catch {}
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    editForm.setFieldsValue({ quantity: item.quantity, location: item.location });
    setEditModal(true);
  };

  const handleEditSave = async (values: any) => {
    try {
      await updateInventoryFields(guildId, editItem.id, values);
      message.success('更新成功');
      setEditModal(false);
      fetchList();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try { await deleteInventory(guildId, id); message.success('已删除'); fetchList(); } catch {}
  };

  // Excel 导入
  const handleExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { message.error('文件至少需要表头和一行数据'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        return {
          key: idx,
          name: cols[0] || '',
          level: parseInt(cols[1]) || 1,
          quality: parseInt(cols[2]) || 0,
          quantity: parseInt(cols[3]) || 1,
          location: cols[4] || '公会仓库',
        };
      }).filter(r => r.name);
      setExcelData(rows);
      setExcelModal(true);
    };
    reader.readAsText(file);
    return false;
  };

  const handleExcelImport = async () => {
    setExcelImporting(true);
    try {
      // 先根据名称+等级+品质匹配 catalogId
      const matchRes: any = await import('@/api/catalog').then(m =>
        m.batchMatchCatalog(excelData.map(r => ({ name: r.name, level: r.level, quality: r.quality })))
      );
      const items = excelData.map((row, i) => {
        const match = matchRes?.[i] || matchRes?.find?.((m: any) => m.index === i);
        if (!match?.catalogId) return null;
        return { catalogId: match.catalogId, quantity: row.quantity, location: row.location };
      }).filter(Boolean);
      if (items.length === 0) { message.error('没有匹配到任何装备，请确认参考库中已有对应装备'); setExcelImporting(false); return; }
      const res: any = await batchUpsertInventory(guildId, items);
      message.success(`导入完成: ${res.upserted || items.length} 条`);
      setExcelModal(false);
      fetchList();
    } catch {} finally { setExcelImporting(false); }
  };

  // 变动日志
  const openLogs = async (item: any) => {
    setLogTarget(item);
    setLogDrawer(true);
    setLogsLoading(true);
    try {
      const res: any = await getInventoryLogs(guildId, item.id, { pageSize: 50 });
      setLogs(res?.list || []);
    } catch { setLogs([]); } finally { setLogsLoading(false); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '装备名称', key: 'name',
      render: (_: any, r: any) => r.catalog?.name || '-',
    },
    {
      title: '等级', key: 'level', width: 70,
      render: (_: any, r: any) => r.catalog ? `Lv.${r.catalog.level}` : '-',
    },
    {
      title: '品质', key: 'quality', width: 70,
      render: (_: any, r: any) => r.catalog ? <Tag color={QUALITY_COLORS[r.catalog.quality]}>{QUALITY_LABELS[r.catalog.quality]}</Tag> : '-',
    },
    {
      title: '装等', key: 'gearScore', width: 70,
      render: (_: any, r: any) => r.catalog ? <Tag>P{r.catalog.gearScore}</Tag> : '-',
    },
    {
      title: '部位', key: 'category', width: 80,
      render: (_: any, r: any) => r.catalog?.category || '-',
    },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80,
      render: (v: number) => <Text strong style={{ color: v > 0 ? '#52c41a' : '#ff4d4f' }}>{v}</Text>,
    },
    { title: '位置', dataIndex: 'location', key: 'location', width: 120, ellipsis: true },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
          <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => openLogs(record)}>日志</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>装备库存</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          <Upload accept=".csv,.txt" showUploadList={false} beforeUpload={handleExcelFile}>
            <Button icon={<UploadOutlined />}>Excel/CSV导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { setUpsertModal(true); setSelectedCatalogId(null); upsertForm.resetFields(); }}>录入库存</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={handleSearch}>
          <Form.Item name="keyword"><Input placeholder="搜索装备名称" prefix={<SearchOutlined />} allowClear /></Form.Item>
          <Form.Item name="category">
            <Select placeholder="部位" allowClear style={{ width: 100 }}>
              {CATEGORIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="level">
            <Select placeholder="等级" allowClear style={{ width: 90 }}>
              {[1,2,3,4,5,6,7,8].map(l => <Select.Option key={l} value={l}>Lv.{l}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="quality">
            <Select placeholder="品质" allowClear style={{ width: 90 }}>
              {QUALITY_LABELS.map((q, i) => <Select.Option key={i} value={i}>{q}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
        </Form>
      </Card>

      <Card>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="middle"
          pagination={{ current: page, total, pageSize: 50, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }}
        />
      </Card>

      {/* 录入库存弹窗 */}
      <Modal title="录入库存" open={upsertModal} onCancel={() => setUpsertModal(false)} footer={null} destroyOnClose>
        <Form form={upsertForm} onFinish={handleUpsert} layout="vertical">
          <Form.Item label="搜索装备（输入名称模糊匹配参考库）" required>
            <AutoComplete options={catalogOptions} onSearch={handleCatalogSearch} onSelect={handleCatalogSelect}
              placeholder="输入装备名称搜索..." style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]} initialValue={1}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="位置" initialValue="公会仓库">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>保存</Button></Form.Item>
        </Form>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal title={`编辑 - ${editItem?.catalog?.name || ''}`} open={editModal} onCancel={() => setEditModal(false)} footer={null} destroyOnClose>
        <Form form={editForm} onFinish={handleEditSave} layout="vertical">
          <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="location" label="位置">
            <Input placeholder="如: 蓝城公会岛 仓库1" />
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>保存</Button></Form.Item>
        </Form>
      </Modal>

      {/* Excel 导入预览 */}
      <Modal title="Excel/CSV 导入预览" open={excelModal} onCancel={() => setExcelModal(false)} width={700}
        footer={<Space><Button onClick={() => setExcelModal(false)}>取消</Button><Button type="primary" loading={excelImporting} onClick={handleExcelImport}>确认导入 ({excelData.length} 条)</Button></Space>}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>模板格式: 装备名称,等级,品质,数量,位置</Text>
        <Table size="small" dataSource={excelData} rowKey="key" pagination={{ pageSize: 10 }}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '等级', dataIndex: 'level', width: 60 },
            { title: '品质', dataIndex: 'quality', width: 60 },
            { title: '数量', dataIndex: 'quantity', width: 60 },
            { title: '位置', dataIndex: 'location', width: 120 },
          ]}
        />
      </Modal>

      {/* 变动日志 Drawer */}
      <Drawer title={`变动日志 - ${logTarget?.catalog?.name || ''}`} open={logDrawer} onClose={() => setLogDrawer(false)} width={450}>
        {logsLoading ? <Text type="secondary">加载中...</Text> : (
          <Timeline items={logs.map((log: any) => ({
            color: log.delta > 0 ? 'green' : log.delta < 0 ? 'red' : 'gray',
            children: (
              <div key={log.id}>
                <Text strong>{log.action}</Text>
                <Text> {log.beforeQuantity} → {log.afterQuantity}</Text>
                <Text type={log.delta > 0 ? 'success' : 'danger'}> ({log.delta > 0 ? '+' : ''}{log.delta})</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{log.operatorName || '系统'} · {dayjs(log.createdAt).format('MM-DD HH:mm')}</Text>
                {log.remark && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{log.remark}</Text></>}
              </div>
            ),
          }))} />
        )}
        {logs.length === 0 && !logsLoading && <Text type="secondary">暂无变动记录</Text>}
      </Drawer>
    </div>
  );
}

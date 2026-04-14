import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Popconfirm, AutoComplete, Upload, Timeline, Drawer, Image, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined, SearchOutlined, HistoryOutlined, ScanOutlined, DeleteOutlined } from '@ant-design/icons';
import { getInventoryList, upsertInventory, batchUpsertInventory, updateInventoryFields, deleteInventory, getInventoryLogs } from '@/api/equipment';
import { searchCatalog } from '@/api/catalog';
import { createOcrBatch, getOcrBatchDetail, confirmOcrItem, saveOcrToInventory } from '@/api/ocr';
import { uploadFile } from '@/api/upload';
import { useGuildStore } from '@/stores/guild.store';
import { CATEGORIES, QUALITY_LABELS, formatEquipName } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const QUALITY_COLORS = ['default', 'success', 'processing', 'purple', 'warning'];

export default function EquipmentPage() {
  const { currentGuildId, currentGuildRole } = useGuildStore();
  const guildId = currentGuildId!;
  const isSuperAdmin = currentGuildRole === 'super_admin';
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

  // 批量操作
  const [selectedRowKeys, setSelectedRowKeys] = useState<number[]>([]);
  const [batchLocationModal, setBatchLocationModal] = useState(false);
  const [batchLocation, setBatchLocation] = useState('');

  // 行内数量修改（防抖）
  const handleInlineQuantityChange = async (id: number, val: number) => {
    try {
      await updateInventoryFields(guildId, id, { quantity: val });
      message.success('数量已更新');
      fetchList();
    } catch {}
  };

  // 批量修改位置
  const handleBatchLocationSave = async () => {
    if (!batchLocation.trim() || selectedRowKeys.length === 0) return;
    try {
      for (const id of selectedRowKeys) {
        await updateInventoryFields(guildId, id, { location: batchLocation.trim() });
      }
      message.success(`已批量更新 ${selectedRowKeys.length} 条记录的位置`);
      setBatchLocationModal(false);
      setBatchLocation('');
      setSelectedRowKeys([]);
      fetchList();
    } catch {}
  };

  // OCR 识别入库
  const [ocrModal, setOcrModal] = useState(false);
  const [ocrStep, setOcrStep] = useState<'upload' | 'review' | 'done'>('upload');
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrBatchId, setOcrBatchId] = useState<number | null>(null);
  const [ocrItems, setOcrItems] = useState<any[]>([]);
  const [ocrImageUrl, setOcrImageUrl] = useState('');

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
    // 过滤数字前缀（如"44堕神" → "堕神"）
    const cleanKw = keyword.replace(/^\d+/, '').trim();
    if (!cleanKw) { setCatalogOptions([]); return; }
    try {
      const res: any = await searchCatalog(cleanKw);
      setCatalogOptions((res || []).map((item: any) => ({
        value: `${item.id}_${item.name}`,
        label: formatEquipName(item),
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

  // OCR 识别处理
  const handleOcrUpload = async (file: File) => {
    setOcrLoading(true);
    try {
      const uploadRes: any = await uploadFile(file);
      const imageUrl = uploadRes?.url || uploadRes?.filePath || '';
      setOcrImageUrl(imageUrl);
      const batchRes: any = await createOcrBatch(guildId, { imageUrl });
      setOcrBatchId(batchRes?.id || batchRes?.batchId);
      const itemsRes: any = await getOcrBatchDetail(guildId, batchRes?.id || batchRes?.batchId);
      setOcrItems(Array.isArray(itemsRes) ? itemsRes : itemsRes?.items || itemsRes?.list || []);
      setOcrStep('review');
    } catch {
      message.error('OCR 识别失败');
    } finally { setOcrLoading(false); }
    return false;
  };

  const handleOcrConfirmItem = async (itemId: number) => {
    try {
      await confirmOcrItem(guildId, itemId, { status: 'confirmed' });
      setOcrItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'confirmed' } : i));
      message.success('已确认');
    } catch {}
  };

  const handleOcrDiscardItem = async (itemId: number) => {
    try {
      await confirmOcrItem(guildId, itemId, { status: 'discarded' });
      setOcrItems(prev => prev.map(i => i.id === itemId ? { ...i, status: 'discarded' } : i));
    } catch {}
  };

  const handleOcrCommit = async () => {
    if (!ocrBatchId) return;
    setOcrLoading(true);
    try {
      await saveOcrToInventory(guildId, ocrBatchId);
      message.success('OCR 识别结果已写入库存');
      setOcrStep('done');
      fetchList();
    } catch {} finally { setOcrLoading(false); }
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '装备名称', key: 'name',
      render: (_: any, r: any) => r.catalog ? formatEquipName(r.catalog) : '-',
    },
    {
      title: '等级', key: 'level', width: 70,
      render: (_: any, r: any) => r.catalog ? r.catalog.level : '-',
    },
    {
      title: '品质', key: 'quality', width: 70,
      render: (_: any, r: any) => r.catalog ? r.catalog.quality : '-',
    },
    {
      title: '装等', key: 'gearScore', width: 70,
      render: (_: any, r: any) => r.catalog?.gearScore ? `P${r.catalog.gearScore}` : '-',
    },
    {
      title: '部位', key: 'category', width: 80,
      render: (_: any, r: any) => r.catalog?.category || '-',
    },
    {
      title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100,
      render: (v: number, record: any) => (
        <InputNumber
          size="small"
          min={0}
          value={v}
          style={{ width: 80 }}
          onChange={(val) => {
            if (val !== null && val !== v) {
              handleInlineQuantityChange(record.id, val);
            }
          }}
        />
      ),
    },
    {
      title: '位置', dataIndex: 'location', key: 'location', width: 150,
      render: (v: string, record: any) => (
        <Input
          size="small"
          defaultValue={v || ''}
          style={{ width: 130 }}
          onBlur={(e) => {
            const newVal = e.target.value.trim();
            if (newVal !== (v || '')) {
              updateInventoryFields(guildId, record.id, { location: newVal })
                .then(() => { message.success('位置已更新'); fetchList(); })
                .catch(() => {});
            }
          }}
          onPressEnter={(e) => (e.target as HTMLInputElement).blur()}
        />
      ),
    },
    {
      title: '操作', key: 'actions', width: isSuperAdmin ? 130 : 80,
      render: (_: any, record: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<HistoryOutlined />} onClick={() => openLogs(record)}>日志</Button>
          {isSuperAdmin && (
            <Popconfirm title="确认删除该库存记录？" onConfirm={() => handleDelete(record.id)} okText="删除" okButtonProps={{ danger: true }}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
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
          <Button icon={<ScanOutlined />} onClick={() => { setOcrModal(true); setOcrStep('upload'); setOcrItems([]); setOcrBatchId(null); }}>OCR识别入库</Button>
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
              {[1,2,3,4,5,6,7,8].map(l => <Select.Option key={l} value={l}>{l}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="quality">
            <Select placeholder="品质" allowClear style={{ width: 90 }}>
              {[0,1,2,3,4].map(i => <Select.Option key={i} value={i}>{i}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="gearScore">
            <Select placeholder="装等" allowClear style={{ width: 90 }}>
              {[4,5,6,7,8,9,10,11,12].map(g => <Select.Option key={g} value={g}>P{g}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
        </Form>
      </Card>

      <Card>
        {selectedRowKeys.length > 0 && (
          <Space style={{ marginBottom: 12 }}>
            <Text>已选 {selectedRowKeys.length} 条</Text>
            <Button size="small" onClick={() => setBatchLocationModal(true)}>批量修改位置</Button>
          </Space>
        )}
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} size="middle"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as number[]),
          }}
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

      {/* OCR 识别入库 Modal */}
      <Modal
        title="OCR 智能识别入库"
        open={ocrModal}
        onCancel={() => setOcrModal(false)}
        width={700}
        footer={ocrStep === 'review' ? (
          <Space>
            <Button onClick={() => setOcrModal(false)}>取消</Button>
            <Button type="primary" loading={ocrLoading} onClick={handleOcrCommit}
              disabled={ocrItems.filter(i => i.status === 'confirmed').length === 0}>
              确认入库 ({ocrItems.filter(i => i.status === 'confirmed').length} 条)
            </Button>
          </Space>
        ) : ocrStep === 'done' ? (
          <Button type="primary" onClick={() => setOcrModal(false)}>完成</Button>
        ) : null}
      >
        {ocrStep === 'upload' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            {ocrLoading ? (
              <Spin tip="正在识别中..." size="large" />
            ) : (
              <Upload.Dragger accept="image/*" showUploadList={false} beforeUpload={handleOcrUpload}>
                <p><ScanOutlined style={{ fontSize: 48, color: '#1677ff' }} /></p>
                <p>点击或拖拽上传装备截图</p>
                <p style={{ color: '#999' }}>支持 JPG/PNG 格式</p>
              </Upload.Dragger>
            )}
          </div>
        )}

        {ocrStep === 'review' && (
          <div>
            {ocrImageUrl && <Image src={ocrImageUrl} style={{ maxHeight: 150, marginBottom: 12 }} />}
            <Table
              dataSource={ocrItems}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: '装备名称', dataIndex: 'equipmentName', key: 'name' },
                { title: '匹配结果', dataIndex: 'matchedCatalogName', key: 'match', render: (v: string) => v || <Tag color="red">未匹配</Tag> },
                { title: '数量', dataIndex: 'quantity', key: 'qty', width: 60 },
                {
                  title: '状态', dataIndex: 'status', key: 'status', width: 80,
                  render: (v: string) => v === 'confirmed' ? <Tag color="green">已确认</Tag> : v === 'discarded' ? <Tag color="red">已丢弃</Tag> : <Tag>待确认</Tag>,
                },
                {
                  title: '操作', key: 'action', width: 120,
                  render: (_: any, record: any) => record.status === 'pending' ? (
                    <Space size="small">
                      <Button size="small" type="link" onClick={() => handleOcrConfirmItem(record.id)}>确认</Button>
                      <Button size="small" type="link" danger onClick={() => handleOcrDiscardItem(record.id)}>丢弃</Button>
                    </Space>
                  ) : null,
                },
              ]}
            />
          </div>
        )}

        {ocrStep === 'done' && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Tag color="green" style={{ fontSize: 16, padding: '8px 16px' }}>入库完成</Tag>
          </div>
        )}
      </Modal>
      {/* 批量修改位置 */}
      <Modal title={`批量修改位置 (${selectedRowKeys.length} 条)`} open={batchLocationModal} onCancel={() => setBatchLocationModal(false)}
        onOk={handleBatchLocationSave} okText="确认修改">
        <Input placeholder="输入新位置" value={batchLocation} onChange={e => setBatchLocation(e.target.value)} />
      </Modal>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Upload, Typography, message, Tag, Modal, Image, Form, Input, InputNumber, Select, Popconfirm, Spin } from 'antd';
import { UploadOutlined, ReloadOutlined, CheckOutlined, CloseOutlined, SaveOutlined, EyeOutlined } from '@ant-design/icons';
import { createOcrBatch, getOcrBatches, getOcrBatchDetail, confirmOcrItem, confirmAllOcrItems, saveOcrToInventory } from '@/api/ocr';
import { uploadFile } from '@/api/upload';
import { searchCatalog } from '@/api/catalog';
import { useGuildStore } from '@/stores/guild.store';
import { QUALITY_LABELS } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待识别', color: 'default' },
  recognized: { label: '已识别', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  saved: { label: '已入库', color: 'cyan' },
  failed: { label: '失败', color: 'red' },
};

const ITEM_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'orange' },
  confirmed: { label: '已确认', color: 'green' },
  discarded: { label: '已丢弃', color: 'default' },
  saved: { label: '已入库', color: 'cyan' },
};

export default function OcrPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 详情/确认
  const [detailModal, setDetailModal] = useState(false);
  const [currentBatch, setCurrentBatch] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 编辑单条
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [editForm] = Form.useForm();
  const [catalogOptions, setCatalogOptions] = useState<any[]>([]);

  const fetchBatches = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getOcrBatches(guildId, { pageSize: 50 });
      setBatches(res?.list || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchBatches(); }, [guildId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const uploadRes: any = await uploadFile(file);
      await createOcrBatch(guildId, { imageUrl: uploadRes.url, imageType: 'inventory' });
      message.success('图片已上传，正在识别...');
      setTimeout(fetchBatches, 2000);
    } catch {} finally { setUploading(false); }
    return false;
  };

  const openDetail = async (batch: any) => {
    setCurrentBatch(batch);
    setDetailModal(true);
    setDetailLoading(true);
    try {
      const res: any = await getOcrBatchDetail(guildId, batch.id);
      setCurrentBatch(res.batch);
      setItems(res.items || []);
    } catch {} finally { setDetailLoading(false); }
  };

  const handleConfirmItem = async (itemId: number, status: 'confirmed' | 'discarded') => {
    try {
      await confirmOcrItem(guildId, itemId, { status });
      message.success(status === 'confirmed' ? '已确认' : '已丢弃');
      if (currentBatch) {
        const res: any = await getOcrBatchDetail(guildId, currentBatch.id);
        setItems(res.items || []);
        setCurrentBatch(res.batch);
      }
    } catch {}
  };

  const handleConfirmAll = async () => {
    if (!currentBatch) return;
    try {
      await confirmAllOcrItems(guildId, currentBatch.id);
      message.success('全部确认完成');
      const res: any = await getOcrBatchDetail(guildId, currentBatch.id);
      setItems(res.items || []);
      setCurrentBatch(res.batch);
    } catch {}
  };

  const handleSave = async () => {
    if (!currentBatch) return;
    try {
      const res: any = await saveOcrToInventory(guildId, currentBatch.id);
      message.success(`成功入库 ${res.saved} 件装备`);
      const detail: any = await getOcrBatchDetail(guildId, currentBatch.id);
      setItems(detail.items || []);
      setCurrentBatch(detail.batch);
      fetchBatches();
    } catch {}
  };

  // 编辑单条
  const openEditItem = (item: any) => {
    setEditItem(item);
    editForm.setFieldsValue({
      confirmedName: item.confirmedName || item.matchedCatalogName || item.equipmentName,
      confirmedQuantity: item.confirmedQuantity || item.quantity,
      confirmedLevel: item.confirmedLevel || item.level,
      confirmedQuality: item.confirmedQuality ?? item.quality,
    });
    setEditModal(true);
  };

  const handleEditSave = async (values: any) => {
    if (!editItem) return;
    try {
      await confirmOcrItem(guildId, editItem.id, { ...values, status: 'confirmed' });
      message.success('已确认并保存');
      setEditModal(false);
      if (currentBatch) {
        const res: any = await getOcrBatchDetail(guildId, currentBatch.id);
        setItems(res.items || []);
        setCurrentBatch(res.batch);
      }
    } catch {}
  };

  const handleCatalogSearch = async (keyword: string) => {
    if (!keyword) { setCatalogOptions([]); return; }
    try {
      const res: any = await searchCatalog(keyword);
      setCatalogOptions((res || []).map((c: any) => ({
        value: c.id,
        label: `${c.name} Lv.${c.level} Q${c.quality} ${c.category}`,
      })));
    } catch {}
  };

  const batchColumns = [
    { title: '批次号', dataIndex: 'batchNo', key: 'batchNo', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => { const info = STATUS_MAP[s] || { label: s, color: 'default' }; return <Tag color={info.color}>{info.label}</Tag>; },
    },
    { title: '识别/确认/入库', key: 'counts', width: 140, render: (_: any, r: any) => `${r.totalItems} / ${r.confirmedItems} / ${r.savedItems}` },
    { title: '上传人', dataIndex: 'uploadUserName', key: 'uploader', width: 100 },
    { title: '时间', dataIndex: 'createdAt', key: 'time', width: 150, render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
    {
      title: '操作', key: 'actions', width: 100,
      render: (_: any, r: any) => <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r)}>查看</Button>,
    },
  ];

  const itemColumns = [
    { title: '识别名称', dataIndex: 'equipmentName', key: 'name', ellipsis: true },
    {
      title: '匹配结果', key: 'match',
      render: (_: any, r: any) => r.matchedCatalogName
        ? <><Text>{r.matchedCatalogName}</Text> <Tag color="blue">{r.confidence}%</Tag></>
        : <Tag color="red">未匹配</Tag>,
    },
    { title: '数量', dataIndex: 'quantity', key: 'qty', width: 60 },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (s: string) => { const info = ITEM_STATUS[s] || { label: s, color: 'default' }; return <Tag color={info.color}>{info.label}</Tag>; },
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, r: any) => r.status === 'pending' ? (
        <Space size="small">
          <Button size="small" type="link" onClick={() => openEditItem(r)}>修正</Button>
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={() => handleConfirmItem(r.id, 'confirmed')}>确认</Button>
          <Button size="small" type="link" danger icon={<CloseOutlined />} onClick={() => handleConfirmItem(r.id, 'discarded')}>丢弃</Button>
        </Space>
      ) : <Text type="secondary">{ITEM_STATUS[r.status]?.label}</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>OCR 智能识别入库</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchBatches}>刷新</Button>
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload}>
            <Button type="primary" icon={<UploadOutlined />} loading={uploading}>上传仓库截图</Button>
          </Upload>
        </Space>
      </div>

      <Card>
        <Table columns={batchColumns} dataSource={batches} rowKey="id" loading={loading} size="middle"
          pagination={{ pageSize: 20, showTotal: t => `共 ${t} 条` }} />
      </Card>

      {/* 批次详情/确认弹窗 */}
      <Modal title={`OCR 识别详情 - ${currentBatch?.batchNo || ''}`} open={detailModal} onCancel={() => setDetailModal(false)}
        width={900} footer={null}>
        <Spin spinning={detailLoading}>
          {currentBatch && (
            <>
              <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                <div style={{ flex: '0 0 200px' }}>
                  <Image src={currentBatch.imageUrl} width={200} style={{ borderRadius: 8 }} />
                </div>
                <div>
                  <Text>状态: <Tag color={STATUS_MAP[currentBatch.status]?.color}>{STATUS_MAP[currentBatch.status]?.label}</Tag></Text><br />
                  <Text>识别: {currentBatch.totalItems} 件 · 已确认: {currentBatch.confirmedItems} 件 · 已入库: {currentBatch.savedItems} 件</Text><br />
                  <Text type="secondary">上传: {currentBatch.uploadUserName} · {dayjs(currentBatch.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <Space>
                  {currentBatch.status === 'recognized' && (
                    <Button type="primary" onClick={handleConfirmAll}>全部确认</Button>
                  )}
                  {(currentBatch.status === 'confirmed' || currentBatch.status === 'recognized') && (
                    <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>写入库存</Button>
                  )}
                </Space>
              </div>

              <Table columns={itemColumns} dataSource={items} rowKey="id" size="small" pagination={false} />
            </>
          )}
        </Spin>
      </Modal>

      {/* 编辑单条弹窗 */}
      <Modal title="修正识别结果" open={editModal} onCancel={() => setEditModal(false)} footer={null} destroyOnClose>
        <Form form={editForm} onFinish={handleEditSave} layout="vertical">
          <Form.Item label="原始识别"><Text type="secondary">{editItem?.equipmentName}</Text></Form.Item>
          <Form.Item name="confirmedName" label="确认装备名称"><Input /></Form.Item>
          <Form.Item name="confirmedCatalogId" label="关联参考库装备">
            <Select showSearch placeholder="搜索装备..." filterOption={false} onSearch={handleCatalogSearch}
              options={catalogOptions} allowClear />
          </Form.Item>
          <Space>
            <Form.Item name="confirmedLevel" label="等级"><InputNumber min={1} max={8} /></Form.Item>
            <Form.Item name="confirmedQuality" label="品质">
              <Select style={{ width: 100 }}>
                {QUALITY_LABELS.map((q, i) => <Select.Option key={i} value={i}>{i}-{q}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="confirmedQuantity" label="数量"><InputNumber min={1} /></Form.Item>
          </Space>
          <Form.Item><Button type="primary" htmlType="submit" block>确认保存</Button></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

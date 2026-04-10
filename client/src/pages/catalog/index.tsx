import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Popconfirm, Upload, Image } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined, SearchOutlined, DeleteOutlined, EditOutlined, PictureOutlined } from '@ant-design/icons';
import { getCatalogList, createCatalog, updateCatalog, deleteCatalog, csvImportCatalog, getCatalogImages, addCatalogImage, deleteCatalogImage, setPrimaryCatalogImage } from '@/api/catalog';
import { uploadFile } from '@/api/upload';
import { CATEGORIES, QUALITY_LABELS } from '@/types';
import type { EquipmentCatalog } from '@/types';

const { Title, Text } = Typography;

const QUALITY_COLORS = ['default', 'success', 'processing', 'purple', 'warning'];

export default function CatalogPage() {
  const [list, setList] = useState<EquipmentCatalog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<any>({});
  const [editModal, setEditModal] = useState(false);
  const [editItem, setEditItem] = useState<EquipmentCatalog | null>(null);
  const [csvModal, setCsvModal] = useState(false);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [imageModal, setImageModal] = useState(false);
  const [imageTarget, setImageTarget] = useState<{ id: number; name: string } | null>(null);
  const [images, setImages] = useState<any[]>([]);
  const [form] = Form.useForm();

  const fetchList = async (p = page, f = filters) => {
    setLoading(true);
    try {
      const res: any = await getCatalogList({ ...f, page: p, pageSize: 50 });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);

  const handleSearch = (values: any) => {
    const f = { ...values };
    Object.keys(f).forEach(k => { if (f[k] === undefined || f[k] === '') delete f[k]; });
    setFilters(f);
    setPage(1);
    fetchList(1, f);
  };

  const handleEdit = (item: EquipmentCatalog | null) => {
    setEditItem(item);
    if (item) form.setFieldsValue(item);
    else form.resetFields();
    setEditModal(true);
  };

  const handleSave = async (values: any) => {
    try {
      if (editItem) {
        await updateCatalog(editItem.id, values);
        message.success('更新成功');
      } else {
        await createCatalog(values);
        message.success('创建成功');
      }
      setEditModal(false);
      fetchList();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try { await deleteCatalog(id); message.success('已删除'); fetchList(); } catch {}
  };

  // CSV 解析
  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { message.error('CSV文件至少需要表头和一行数据'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const rows = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        const nameIdx = headers.findIndex(h => h.includes('名称') || h === 'name');
        const levelIdx = headers.findIndex(h => h.includes('等级') || h === 'level');
        const qualityIdx = headers.findIndex(h => h.includes('品质') || h === 'quality');
        const categoryIdx = headers.findIndex(h => h.includes('部位') || h === 'category');
        return {
          key: idx,
          name: cols[nameIdx >= 0 ? nameIdx : 0] || '',
          level: parseInt(cols[levelIdx >= 0 ? levelIdx : 1]) || 1,
          quality: parseInt(cols[qualityIdx >= 0 ? qualityIdx : 2]) || 0,
          category: cols[categoryIdx >= 0 ? categoryIdx : 3] || '其他',
        };
      }).filter(r => r.name);
      setCsvData(rows);
      setCsvModal(true);
    };
    reader.readAsText(file);
    return false;
  };

  const handleCsvImport = async () => {
    setCsvImporting(true);
    try {
      const res: any = await csvImportCatalog(csvData);
      message.success(`导入完成: 成功${res.success}, 跳过${res.skipped}, 失败${res.failed}`);
      setCsvModal(false);
      fetchList();
    } catch {} finally { setCsvImporting(false); }
  };

  // 图片管理
  const openImageManager = async (item: EquipmentCatalog) => {
    setImageTarget({ id: item.id, name: item.name });
    try {
      const res: any = await getCatalogImages(item.id);
      setImages(res || []);
    } catch { setImages([]); }
    setImageModal(true);
  };

  const handleUploadImage = async (file: File) => {
    if (!imageTarget) return false;
    try {
      const uploadRes: any = await uploadFile(file);
      await addCatalogImage(imageTarget.id, { imageUrl: uploadRes.url, fileName: file.name, fileSize: file.size });
      message.success('图片上传成功');
      const res: any = await getCatalogImages(imageTarget.id);
      setImages(res || []);
    } catch {}
    return false;
  };

  const handleDeleteImage = async (imgId: number) => {
    try {
      await deleteCatalogImage(imgId);
      message.success('图片已删除');
      if (imageTarget) {
        const res: any = await getCatalogImages(imageTarget.id);
        setImages(res || []);
      }
    } catch {}
  };

  const handleSetPrimary = async (imgId: number) => {
    if (!imageTarget) return;
    try {
      await setPrimaryCatalogImage(imageTarget.id, imgId);
      message.success('已设为主图');
      const res: any = await getCatalogImages(imageTarget.id);
      setImages(res || []);
      fetchList();
    } catch {}
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    {
      title: '图标', dataIndex: 'imageUrl', key: 'icon', width: 60,
      render: (url: string) => url ? <Image src={url} width={32} height={32} style={{ objectFit: 'cover', borderRadius: 4 }} /> : <PictureOutlined style={{ fontSize: 20, color: '#ccc' }} />,
    },
    { title: '装备名称', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '等级', dataIndex: 'level', key: 'level', width: 70,
      render: (v: number) => `Lv.${v}`,
    },
    {
      title: '品质', dataIndex: 'quality', key: 'quality', width: 70,
      render: (v: number) => <Tag color={QUALITY_COLORS[v]}>{QUALITY_LABELS[v]}</Tag>,
    },
    {
      title: '装等', dataIndex: 'gearScore', key: 'gearScore', width: 70,
      render: (v: number) => <Tag>P{v}</Tag>,
    },
    { title: '部位', dataIndex: 'category', key: 'category', width: 80 },
    {
      title: '操作', key: 'actions', width: 180,
      render: (_: any, record: EquipmentCatalog) => (
        <Space size="small">
          <Button size="small" type="link" icon={<PictureOutlined />} onClick={() => openImageManager(record)}>图片</Button>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
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
        <Title level={4} style={{ margin: 0 }}>装备参考库</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          <Upload accept=".csv" showUploadList={false} beforeUpload={handleCsvFile}>
            <Button icon={<UploadOutlined />}>CSV导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEdit(null)}>新增装备</Button>
        </Space>
      </div>

      {/* 筛选栏 */}
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
          pagination={{ current: page, total, pageSize: 50, showTotal: t => `共 ${t} 条`, onChange: (p) => { setPage(p); fetchList(p); } }}
        />
      </Card>

      {/* 新增/编辑弹窗 */}
      <Modal title={editItem ? '编辑装备' : '新增装备'} open={editModal} onCancel={() => setEditModal(false)} footer={null} destroyOnClose>
        <Form form={form} onFinish={handleSave} layout="vertical" initialValues={{ level: 5, quality: 0, category: '武器' }}>
          <Form.Item name="name" label="装备名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="level" label="等级" rules={[{ required: true }]}>
              <InputNumber min={1} max={8} />
            </Form.Item>
            <Form.Item name="quality" label="品质" rules={[{ required: true }]}>
              <Select style={{ width: 100 }}>
                {QUALITY_LABELS.map((q, i) => <Select.Option key={i} value={i}>{i} - {q}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="category" label="部位" rules={[{ required: true }]}>
              <Select style={{ width: 100 }}>
                {CATEGORIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
              </Select>
            </Form.Item>
          </Space>
          <Form.Item name="gearScore" label="装等（留空自动计算=等级+品质）"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item><Button type="primary" htmlType="submit" block>保存</Button></Form.Item>
        </Form>
      </Modal>

      {/* CSV 预览弹窗 */}
      <Modal title="CSV 导入预览" open={csvModal} onCancel={() => setCsvModal(false)} width={700}
        footer={<Space><Button onClick={() => setCsvModal(false)}>取消</Button><Button type="primary" loading={csvImporting} onClick={handleCsvImport}>确认导入 ({csvData.length} 条)</Button></Space>}>
        <Table size="small" dataSource={csvData} rowKey="key" pagination={{ pageSize: 10 }}
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '等级', dataIndex: 'level', width: 60 },
            { title: '品质', dataIndex: 'quality', width: 60 },
            { title: '部位', dataIndex: 'category', width: 80 },
          ]}
        />
      </Modal>

      {/* 图片管理弹窗 */}
      <Modal title={`图片管理 - ${imageTarget?.name || ''}`} open={imageModal} onCancel={() => setImageModal(false)} footer={null} width={600}>
        <Upload accept="image/*" showUploadList={false} beforeUpload={handleUploadImage}>
          <Button icon={<UploadOutlined />} style={{ marginBottom: 16 }}>上传图片</Button>
        </Upload>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {images.map((img: any) => (
            <div key={img.id} style={{ position: 'relative', border: img.isPrimary ? '2px solid #1677ff' : '1px solid #d9d9d9', borderRadius: 8, padding: 4 }}>
              <Image src={img.imageUrl} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 6 }} />
              <div style={{ textAlign: 'center', marginTop: 4 }}>
                {img.isPrimary ? <Tag color="blue" style={{ fontSize: 10 }}>主图</Tag> :
                  <Button size="small" type="link" onClick={() => handleSetPrimary(img.id)}>设为主图</Button>}
                <Popconfirm title="删除图片？" onConfirm={() => handleDeleteImage(img.id)}>
                  <Button size="small" type="link" danger>删除</Button>
                </Popconfirm>
              </div>
            </div>
          ))}
          {images.length === 0 && <Text type="secondary">暂无图片</Text>}
        </div>
      </Modal>
    </div>
  );
}

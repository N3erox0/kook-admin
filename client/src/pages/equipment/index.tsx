import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Popconfirm, AutoComplete, Upload, Timeline, Drawer, Image, Spin, Dropdown, MenuProps, Radio } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined, SearchOutlined, HistoryOutlined, ScanOutlined, DeleteOutlined, DownloadOutlined, AppstoreOutlined, MoreOutlined } from '@ant-design/icons';
import { getInventoryList, upsertInventory, batchUpsertInventory, updateInventoryFields, deleteInventory, getInventoryLogs, gridParseInventory, gridSaveInventory } from '@/api/equipment';
import { searchCatalog } from '@/api/catalog';
import { createOcrBatch, getOcrBatchDetail, confirmOcrItem, saveOcrToInventory } from '@/api/ocr';
import { uploadFile } from '@/api/upload';
import request from '@/api/request';
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

  // V2.9.2 网格识别入库（方案D）— V2.9.9.1: 新增 layout 选择
  const [gridModal, setGridModal] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridImageUrl, setGridImageUrl] = useState('');
  const [gridLayout, setGridLayout] = useState<string>('5x7');
  // V2.10.5: 半自动画框
  const [gridPreviewSrc, setGridPreviewSrc] = useState(''); // 上传后的本地预览 URL
  const [gridAnchor, setGridAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [gridDrawing, setGridDrawing] = useState(false);
  const [gridDrawStart, setGridDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [gridCells, setGridCells] = useState<Array<{
    row: number; col: number; thumbnail: string; quantity: number;
    detectedLevel: number | null; detectedQuality: number | null;
    aliasName: string; level: number; quality: number; location: string;
    aliasOptions?: any[]; // AutoComplete 候选
  }>>([]);
  const [gridSaving, setGridSaving] = useState(false);
  const [gridOnlyUnfilled, setGridOnlyUnfilled] = useState(false);

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

  // 搜索装备参考库（下拉）— V2.9.5: 支持P格式/别称/数字前缀，后端已处理解析
  const handleCatalogSearch = async (keyword: string) => {
    if (!keyword || keyword.length < 1) { setCatalogOptions([]); return; }
    try {
      const res: any = await searchCatalog(keyword.trim());
      setCatalogOptions((res || []).map((item: any) => ({
        value: formatEquipName(item),
        label: formatEquipName(item),
        item,
      })));
    } catch { setCatalogOptions([]); }
  };

  const handleCatalogSelect = (_: string, option: any) => {
    if (option?.item?.id) {
      setSelectedCatalogId(option.item.id);
      upsertForm.setFieldsValue({ catalogId: option.item.id });
    }
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
      // 去掉 BOM
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { message.error('文件至少需要表头和一行数据'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // 自动检测格式：
      // V2.9.1+ 新格式: 别称,等级,品质,装等,数量,位置 (6列)
      // 旧格式: 装备名称,等级,品质,数量,位置 (5列)
      const isNewFormat = headers.length >= 6 && (headers[0].includes('别称') || headers[0].includes('名称'));
      const isOldFormat = headers.length === 5;

      const rows = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (isNewFormat) {
          // 别称,等级,品质,装等,数量,位置
          return {
            key: idx,
            name: cols[0] || '',
            level: parseInt(cols[1]) || 1,
            quality: parseInt(cols[2]) || 0,
            gearScore: cols[3] ? parseInt(cols[3].replace(/^P/i, '')) || 0 : 0,
            quantity: parseInt(cols[4]) || 1,
            location: cols[5] || '公会仓库',
          };
        } else if (isOldFormat) {
          // 装备名称,等级,品质,数量,位置
          return {
            key: idx,
            name: cols[0] || '',
            level: parseInt(cols[1]) || 1,
            quality: parseInt(cols[2]) || 0,
            gearScore: 0,
            quantity: parseInt(cols[3]) || 1,
            location: cols[4] || '公会仓库',
          };
        }
        // 兜底
        return {
          key: idx,
          name: cols[0] || '',
          level: parseInt(cols[1]) || 1,
          quality: parseInt(cols[2]) || 0,
          gearScore: 0,
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
      // 先根据名称/别称+等级+品质匹配 catalogId（后端支持精确/别称/模糊三档）
      const matchRes: any = await import('@/api/catalog').then(m =>
        m.batchMatchCatalog(excelData.map(r => ({ name: r.name, level: r.level, quality: r.quality })))
      );

      // 将匹配结果回填到 excelData 以供预览展示
      const enriched = excelData.map((row, i) => {
        const match = matchRes?.[i] || matchRes?.find?.((m: any) => m.index === i);
        return { ...row, catalogId: match?.catalogId || null, matchedName: match?.catalogName || null, matchType: match?.matchType || 'none' };
      });
      setExcelData(enriched);

      const items = enriched.map(row => {
        if (!row.catalogId) return null;
        return { catalogId: row.catalogId, quantity: row.quantity, location: row.location };
      }).filter(Boolean);

      const unmatched = enriched.filter(r => !r.catalogId).length;
      if (items.length === 0) {
        message.error('没有匹配到任何装备，请确认参考库中已有对应装备（含别称）');
        setExcelImporting(false);
        return;
      }

      const res: any = await batchUpsertInventory(guildId, items);
      message.success(`导入成功 ${res.upserted || items.length} 条${unmatched > 0 ? `，${unmatched} 条未匹配（已跳过）` : ''}`);
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
      const items = Array.isArray(itemsRes) ? itemsRes : itemsRes?.items || itemsRes?.list || [];
      setOcrItems(items);
      if (items.length === 0) {
        message.warning('未识别到装备。请确认：1) 上传的是装备截图 2) 装备参考库已初始化图片指纹');
      }
      setOcrStep('review');
    } catch (err: any) {
      const errMsg = err?.message || err?.errorMessage || '';
      if (errMsg.includes('图片指纹') || errMsg.includes('pHash')) {
        message.error('装备参考库未初始化图片指纹，请先在 SSVIP→参考库 执行"生成图片指纹"');
      } else {
        message.error(errMsg || 'OCR 识别失败，请确认上传的是装备截图');
      }
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

  // V2.10.5: 上传后进入画框预览模式
  const handleGridUpload = async (file: File) => {
    // 先生成本地预览
    const localUrl = URL.createObjectURL(file);
    setGridPreviewSrc(localUrl);
    setGridAnchor(null);
    // 同时上传到服务器获取 URL
    try {
      const uploadRes: any = await uploadFile(file);
      const imageUrl = uploadRes?.url || uploadRes?.filePath || '';
      setGridImageUrl(imageUrl);
    } catch (err: any) {
      message.error('图片上传失败');
      setGridPreviewSrc('');
    }
    return false;
  };

  // V2.10.5: 用户画框完成后执行切图（画的是整个装备区）
  const handleGridCutWithAnchor = async () => {
    if (!gridImageUrl || !gridAnchor) { message.warning('请先框选装备区域'); return; }
    setGridLoading(true);
    try {
      // 计算缩放比例：浏览器显示尺寸 vs 图片实际尺寸
      const imgEl = document.getElementById('grid-preview-img') as HTMLImageElement;
      const scaleX = imgEl ? (imgEl.naturalWidth / imgEl.clientWidth) : 1;
      const scaleY = imgEl ? (imgEl.naturalHeight / imgEl.clientHeight) : 1;
      // 将显示坐标转为实际图片坐标
      const realAnchor = {
        x: Math.round(gridAnchor.x * scaleX),
        y: Math.round(gridAnchor.y * scaleY),
        w: Math.round(gridAnchor.w * scaleX),
        h: Math.round(gridAnchor.h * scaleY),
      };
      const parseRes: any = await gridParseInventory(guildId, gridImageUrl, gridLayout, realAnchor);
      const newCells = (parseRes?.cells || []).map((c: any) => ({
        ...c,
        row: c.row + gridCells.length,
        col: c.col,
        aliasName: '',
        level: c.detectedLevel || 6,
        quality: c.detectedQuality ?? 0,
        location: '公会仓库',
        aliasOptions: [],
        matchedName: c.matchedName || '',
        matchedCatalogId: c.matchedCatalogId || null,
        matchedConfidence: c.matchedConfidence || 0,
      }));
      for (const cell of newCells) {
        if (cell.matchedName && cell.matchedConfidence >= 0.55) {
          cell.aliasName = cell.matchedName;
        }
      }
      const merged = [...gridCells, ...newCells];
      setGridCells(merged);
      setGridPreviewSrc(''); // 关闭预览
      if (newCells.length === 0) {
        message.warning('未检测到装备图标');
      } else {
        message.success(`识别完成，本张 ${newCells.length} 格，累计 ${merged.length} 格`);
      }
    } catch (err: any) {
      message.error(err?.message || '网格识别失败');
    } finally {
      setGridLoading(false);
    }
  };

  const handleGridCellChange = (index: number, field: string, value: any) => {
    setGridCells(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // 别名自动补全：调用参考库搜索（V2.9.5: 后端已支持别称+P格式）
  const handleGridAliasSearch = async (index: number, keyword: string) => {
    if (!keyword || keyword.length < 1) return;
    try {
      const res: any = await searchCatalog(keyword.trim());
      const list = Array.isArray(res) ? res : (res?.list || []);
      const options = list.slice(0, 10).map((c: any) => ({
        value: c.aliases?.split(',')[0]?.trim() || c.name,
        label: `${formatEquipName(c)}${c.aliases ? ' - 别称:' + c.aliases : ''}`,
      }));
      setGridCells(prev => {
        const next = [...prev];
        if (next[index]) next[index] = { ...next[index], aliasOptions: options };
        return next;
      });
    } catch {}
  };

  // 批量套用：将第 idx 行的别名应用到所有下方空白行
  const handleGridApplyDown = (idx: number) => {
    const src = gridCells[idx];
    if (!src?.aliasName) {
      message.warning('请先填写该行的装备别名');
      return;
    }
    setGridCells(prev => prev.map((c, i) => {
      if (i > idx && !c.aliasName) {
        return { ...c, aliasName: src.aliasName, level: src.level, quality: src.quality, location: src.location };
      }
      return c;
    }));
    message.success(`已套用到下方空白行`);
  };

  const handleGridSave = async () => {
    const items = gridCells
      .filter(c => c.aliasName && c.aliasName.trim())
      .map(c => ({
        aliasName: c.aliasName.trim(),
        level: c.level,
        quality: c.quality,
        quantity: c.quantity || 1,
        location: c.location || '公会仓库',
      }));

    if (items.length === 0) {
      message.warning('请至少填写一件装备的别名');
      return;
    }

    setGridSaving(true);
    try {
      const res: any = await gridSaveInventory(guildId, items);
      if (res?.success > 0) {
        message.success(`入库成功 ${res.success} 条${res.failed > 0 ? `，失败 ${res.failed} 条` : ''}`);
      }
      if (res?.failures && res.failures.length > 0) {
        const detail = res.failures.slice(0, 5).map((f: any) => `第${f.index + 1}格: ${f.reason}`).join('\n');
        Modal.warning({ title: `${res.failures.length} 条失败明细`, content: <pre style={{ fontSize: 12 }}>{detail}</pre>, width: 500 });
      }
      if (res?.failed === 0) {
        setGridModal(false);
        setGridCells([]);
        setGridImageUrl('');
      }
      fetchList();
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setGridSaving(false);
    }
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
          <Button type="primary" icon={<AppstoreOutlined />} onClick={() => {
            setGridModal(true);
            setGridCells([]);
            setGridImageUrl('');
            setGridLayout('5x7');
          }}>网格识别入库</Button>
          <Button icon={<PlusOutlined />} onClick={() => { setUpsertModal(true); setSelectedCatalogId(null); upsertForm.resetFields(); }}>录入库存</Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'ocr',
                  icon: <ScanOutlined />,
                  label: 'OCR全自动识别',
                  onClick: () => { setOcrModal(true); setOcrStep('upload'); setOcrItems([]); setOcrBatchId(null); },
                },
                {
                  key: 'csv-upload',
                  icon: <UploadOutlined />,
                  label: (
                    <Upload accept=".csv,.txt" showUploadList={false} beforeUpload={handleExcelFile}>
                      <span>Excel/CSV导入</span>
                    </Upload>
                  ),
                },
                {
                  key: 'csv-template',
                  icon: <DownloadOutlined />,
                  label: '下载CSV模板',
                  onClick: async () => {
                    try {
                      const res = await request.get('/catalog/csv-template', { responseType: 'blob' });
                      const blob = res as unknown as Blob;
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = '库存导入模板.csv';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                    } catch {
                      message.error('下载模板失败');
                    }
                  },
                },
              ] as MenuProps['items'],
            }}
            trigger={['click']}
          >
            <Button icon={<MoreOutlined />}>更多导入</Button>
          </Dropdown>
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
      <Modal title="Excel/CSV 导入预览" open={excelModal} onCancel={() => setExcelModal(false)} width={900}
        footer={<Space><Button onClick={() => setExcelModal(false)}>取消</Button><Button type="primary" loading={excelImporting} onClick={handleExcelImport}>确认导入 ({excelData.length} 条)</Button></Space>}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          模板格式: 别称,等级,品质,装等,数量,位置（兼容旧格式: 装备名称,等级,品质,数量,位置）
        </Text>
        <Table size="small" dataSource={excelData} rowKey="key" pagination={{ pageSize: 10 }}
          columns={[
            { title: '输入别称/名称', dataIndex: 'name', width: 130 },
            { title: '匹配装备', dataIndex: 'matchedName', width: 140, render: (v: string, row: any) => {
              if (!row.matchType || row.matchType === 'none') {
                return <Text type="secondary">点击导入后匹配</Text>;
              }
              if (!v) return <Tag color="red">未匹配</Tag>;
              const colorMap: any = { exact: 'green', alias: 'blue', fuzzy: 'orange' };
              const labelMap: any = { exact: '精确', alias: '别称', fuzzy: '模糊' };
              return <Space size={4}><Text>{v}</Text><Tag color={colorMap[row.matchType]}>{labelMap[row.matchType]}</Tag></Space>;
            }},
            { title: '等级', dataIndex: 'level', width: 60 },
            { title: '品质', dataIndex: 'quality', width: 60 },
            { title: '装等', dataIndex: 'gearScore', width: 70, render: (v: number) => v > 0 ? `P${v}` : '-' },
            { title: '数量', dataIndex: 'quantity', width: 60 },
            { title: '位置', dataIndex: 'location', width: 120 },
          ]}
        />
      </Modal>

      {/* V2.9.2 网格识别入库（方案D） */}
      <Modal
        title="网格识别入库"
        open={gridModal}
        onCancel={() => { setGridModal(false); setGridCells([]); setGridImageUrl(''); }}
        width={1200}
        destroyOnClose
        footer={
          <Space>
            <Button onClick={() => { setGridModal(false); setGridCells([]); setGridImageUrl(''); }}>取消</Button>
            <Button
              type="primary"
              loading={gridSaving}
              disabled={gridCells.filter(c => c.aliasName?.trim()).length === 0}
              onClick={handleGridSave}
            >
              确认入库（已填 {gridCells.filter(c => c.aliasName?.trim()).length} / {gridCells.length} 条）
            </Button>
          </Space>
        }
      >
        {gridCells.length === 0 ? (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong>选择截图类型：</Text>
              <Radio.Group
                value={gridLayout}
                onChange={(e) => setGridLayout(e.target.value)}
                style={{ display: 'block', marginTop: 8 }}
              >
                <Radio value="5x7">公会岛箱子 / 军队木箱 / 背包中（5×7）</Radio>
                <Radio value="4x5">背包大（4×5）</Radio>
                <Radio value="6x8">背包小（6×8）</Radio>
                <Radio value="5x2">蛋箱（5×2）</Radio>
              </Radio.Group>
            </div>
            {/* 画框预览模式 */}
            {gridPreviewSrc ? (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  在下方图片上拖拽画出<b>整个装备区域</b>的范围（框住所有装备格子），系统按{gridLayout}等分并内缩去掉间隙。
                </Text>
                <div
                  style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', border: '1px solid #d9d9d9', borderRadius: 4 }}
                  onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setGridDrawStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                    setGridDrawing(true);
                  }}
                  onMouseMove={(e) => {
                    if (!gridDrawing || !gridDrawStart) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const curX = e.clientX - rect.left;
                    const curY = e.clientY - rect.top;
                    const x = Math.min(gridDrawStart.x, curX);
                    const y = Math.min(gridDrawStart.y, curY);
                    const w = Math.abs(curX - gridDrawStart.x);
                    const h = Math.abs(curY - gridDrawStart.y);
                    setGridAnchor({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
                  }}
                  onMouseUp={() => { setGridDrawing(false); }}
                >
                  <img
                    id="grid-preview-img"
                    src={gridPreviewSrc}
                    style={{ maxWidth: '100%', maxHeight: 600, display: 'block' }}
                    alt="preview"
                  />
                  {gridAnchor && gridAnchor.w > 5 && gridAnchor.h > 5 && (
                    <div style={{
                      position: 'absolute',
                      left: gridAnchor.x, top: gridAnchor.y,
                      width: gridAnchor.w, height: gridAnchor.h,
                      border: '2px solid #ff4d4f', background: 'rgba(255,77,79,0.08)',
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
                <div style={{ marginTop: 12 }}>
                  {gridAnchor && gridAnchor.w > 30 && gridAnchor.h > 30 ? (
                    <Space>
                      <Text>已选装备区：{gridAnchor.w}×{gridAnchor.h}px</Text>
                      <Button type="primary" loading={gridLoading} onClick={handleGridCutWithAnchor}>
                        开始切图识别
                      </Button>
                      <Button onClick={() => setGridAnchor(null)}>重画</Button>
                    </Space>
                  ) : (
                    <Text type="secondary">请拖拽框选整个装备区域（包含所有格子）</Text>
                  )}
                </div>
              </div>
            ) : (
            <Upload.Dragger
            accept="image/*"
            multiple
            showUploadList={false}
            beforeUpload={handleGridUpload}
            disabled={gridLoading}
          >
            {gridLoading ? (
              <><Spin /> <Text>识别中...（数量OCR需要几秒）</Text></>
            ) : (
              <>
                <p><AppstoreOutlined style={{ fontSize: 48, color: '#1677ff' }} /></p>
                <p style={{ fontSize: 16, fontWeight: 500 }}>点击或拖拽上传装备截图</p>
                <p style={{ fontSize: 12, color: '#999' }}>
                  系统将自动按网格切图并识别数量+品质；装备名由您手动填写（支持别名输入+自动补全）
                </p>
              </>
            )}
          </Upload.Dragger>
            )}
          </div>
        ) : (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Text type="secondary">
                共 {gridCells.length} 格，已填装备别名 {gridCells.filter(c => c.aliasName?.trim()).length} 条
              </Text>
              <Button
                size="small"
                onClick={() => setGridOnlyUnfilled(v => !v)}
              >
                {gridOnlyUnfilled ? '显示全部' : '只显示未填'}
              </Button>
              <Button
                size="small"
                onClick={() => { setGridCells([]); setGridImageUrl(''); }}
              >
                重新上传
              </Button>
            </Space>
            <Table
              size="small"
              rowKey={(r) => `${r.row}-${r.col}`}
              dataSource={gridOnlyUnfilled ? gridCells.filter(c => !c.aliasName?.trim()) : gridCells}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              columns={[
                {
                  title: '#', width: 40,
                  render: (_: any, _r: any, i: number) => i + 1,
                },
                {
                  title: '缩略图', width: 90, dataIndex: 'thumbnail',
                  render: (src: string) => src ? <img src={src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', border: '1px solid #ddd', borderRadius: 4 }} /> : '-',
                },
                {
                  title: '装备别名*', width: 200,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    return (
                      <AutoComplete
                        value={row.aliasName}
                        placeholder="输入装备别名..."
                        style={{ width: '100%' }}
                        options={row.aliasOptions || []}
                        onSearch={(kw) => handleGridAliasSearch(idx, kw)}
                        onChange={(v) => handleGridCellChange(idx, 'aliasName', v)}
                        allowClear
                      />
                    );
                  },
                },
                {
                  title: '等级', width: 80,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    return (
                      <Select
                        size="small"
                        value={row.level}
                        style={{ width: 70 }}
                        onChange={(v) => handleGridCellChange(idx, 'level', v)}
                        options={[1, 2, 3, 4, 5, 6, 7, 8].map(l => ({ value: l, label: `${l}` }))}
                      />
                    );
                  },
                },
                {
                  title: '品质', width: 90,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    const detectedLabel = row.detectedQuality !== null ? `(识别:${row.detectedQuality})` : '';
                    return (
                      <Select
                        size="small"
                        value={row.quality}
                        style={{ width: 80 }}
                        onChange={(v) => handleGridCellChange(idx, 'quality', v)}
                        options={[0, 1, 2, 3, 4].map(q => ({ value: q, label: `${q}` }))}
                        title={detectedLabel}
                      />
                    );
                  },
                },
                {
                  title: '数量', width: 90,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    return (
                      <InputNumber
                        size="small"
                        min={1}
                        value={row.quantity}
                        style={{ width: 80 }}
                        onChange={(v) => handleGridCellChange(idx, 'quantity', v || 1)}
                      />
                    );
                  },
                },
                {
                  title: '位置', width: 120,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    return (
                      <Input
                        size="small"
                        value={row.location}
                        style={{ width: 110 }}
                        onChange={(e) => handleGridCellChange(idx, 'location', e.target.value)}
                      />
                    );
                  },
                },
                {
                  title: '操作', width: 100,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    return (
                      <Space size={4}>
                        <Button
                          size="small"
                          type="link"
                          disabled={!row.aliasName?.trim()}
                          onClick={() => handleGridApplyDown(idx)}
                          title="将此行的别名/等级/品质/位置应用到下方所有未填行"
                        >
                          套用↓
                        </Button>
                        <Button
                          size="small"
                          type="link"
                          danger
                          onClick={() => {
                            setGridCells(prev => prev.filter((_, i) => i !== idx));
                          }}
                        >
                          删除
                        </Button>
                      </Space>
                    );
                  },
                },
              ]}
            />
          </>
        )}
      </Modal>
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

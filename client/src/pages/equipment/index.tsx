import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, Tag, Typography, message, Popconfirm, AutoComplete, Upload, Timeline, Drawer, Image, Spin, Dropdown, MenuProps, Radio, Switch } from 'antd';
import { PlusOutlined, ReloadOutlined, UploadOutlined, SearchOutlined, HistoryOutlined, ScanOutlined, DeleteOutlined, DownloadOutlined, AppstoreOutlined, MoreOutlined, ExportOutlined } from '@ant-design/icons';
import { getInventoryList, upsertInventory, batchUpsertInventory, updateInventoryFields, deleteInventory, getInventoryLogs } from '@/api/equipment';
import { searchCatalog } from '@/api/catalog';
import { createOcrBatch, getOcrBatchDetail, confirmOcrItem, saveOcrToInventory } from '@/api/ocr';
import { uploadFile } from '@/api/upload';
import request from '@/api/request';
import { useGuildStore } from '@/stores/guild.store';
import { CATEGORIES, QUALITY_LABELS, formatEquipName } from '@/types';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const QUALITY_COLORS = ['default', 'success', 'processing', 'purple', 'warning'];

/** V3.2 库存 CSV 模板内容（含 BOM 防 Excel 中文乱码） */
const CSV_TEMPLATE_CONTENT =
  '\uFEFF装备名,数量,位置\n44堕神法杖,20,Gpass地堡\n80长弓,10,公会仓库\n62挣脱鞋,5,蓝城仓库\n';

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '库存导入模板.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

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

  // 行内录入（V3.0.2: 替代 Modal 弹窗）
  const [inlineAdding, setInlineAdding] = useState(false);
  const [inlineQuantity, setInlineQuantity] = useState<number>(1);
  const [inlineLocation, setInlineLocation] = useState<string>('公会仓库');
  const [inlineSaving, setInlineSaving] = useState(false);

  // V3.2: CSV 导入弹窗（前置文件选择 Modal，文件选定后再展示预览 excelModal）
  const [csvImportModal, setCsvImportModal] = useState(false);

  // V3.2: 导出 CSV 全选 Switch
  const [exportAll, setExportAll] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // V2.12 网格识别入库（固定遮罩框+图片拖拽缩放对齐）
  const [gridModal, setGridModal] = useState(false);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridImageUrl, setGridImageUrl] = useState('');
  const [gridLayout, setGridLayout] = useState<string>('guild_island_chest_5x7');
  const [gridPreviewSrc, setGridPreviewSrc] = useState('');
  // 图片变换状态（图片相对于容器的偏移和缩放）
  const [imgTransform, setImgTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [imgDragging, setImgDragging] = useState(false);
  const [imgDragStart, setImgDragStart] = useState({ mx: 0, my: 0, ox: 0, oy: 0 });
  const [gridCells, setGridCells] = useState<Array<{
    row: number; col: number; thumbnail: string; quantity: number;
    detectedLevel: number | null; detectedQuality: number | null;
    aliasName: string; level: number; quality: number; location: string;
    aliasOptions?: any[]; // AutoComplete 候选
  }>>([]);
  const [gridSaving, setGridSaving] = useState(false);
  const [gridOnlyUnfilled, setGridOnlyUnfilled] = useState(false);
  const [gridSelectedKeys, setGridSelectedKeys] = useState<string[]>([]);
  const [gridBatchLocation, setGridBatchLocation] = useState('');

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

  /**
   * V3.2: 一键导出 CSV
   * - exportAll=true：全量
   * - exportAll=false：按当前筛选
   * 列：装备名,等级,品质,装等,部位,数量,位置,更新时间
   */
  const handleExportCsv = async () => {
    if (!guildId) return;
    setExporting(true);
    try {
      // 取数据：拉所有页（pageSize=10000 一次性，导出场景可接受）
      const params: any = { page: 1, pageSize: 10000 };
      if (!exportAll) {
        // 按当前筛选
        Object.assign(params, filters);
      }
      const res: any = await getInventoryList(guildId, params);
      const rows = res?.list || [];
      if (rows.length === 0) {
        message.warning('当前条件下无装备记录可导出');
        return;
      }

      const header = ['装备名', '等级', '品质', '装等', '部位', '数量', '位置', '更新时间'];
      const lines = [header.join(',')];
      for (const r of rows) {
        const cat = r.catalog || {};
        const cells = [
          cat.name || r.equipmentName || '',
          cat.level ?? '',
          cat.quality ?? '',
          cat.gearScore ?? '',
          cat.category || '',
          r.quantity ?? 0,
          r.location || '',
          r.updatedAt ? dayjs(r.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '',
        ].map((v) => {
          const s = String(v ?? '');
          // CSV 字段含逗号/引号/换行 → 用引号包并转义
          if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
          return s;
        });
        lines.push(cells.join(','));
      }

      const csvContent = '\uFEFF' + lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = dayjs().format('YYYYMMDD_HHmmss');
      const scope = exportAll ? 'all' : 'filtered';
      a.download = `装备库存_${scope}_${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success(`已导出 ${rows.length} 条记录`);
    } catch (err: any) {
      message.error(err?.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // Excel 导入
  const handleExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const cleanText = text.replace(/^\uFEFF/, '');
      const lines = cleanText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { message.error('文件至少需要表头和一行数据'); return; }
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

      // V2.13.1: 支持3种格式
      // 简化格式: 装备名,数量,位置 (3列) — 装备名如"44堕神法杖"，自动解析
      // V2.9.1+ 新格式: 别称,等级,品质,装等,数量,位置 (6列)
      // 旧格式: 装备名称,等级,品质,数量,位置 (5列)
      const isSimpleFormat = headers.length === 3;
      const isNewFormat = headers.length >= 6 && (headers[0].includes('别称') || headers[0].includes('名称'));
      const isOldFormat = headers.length === 5;

      const rows = lines.slice(1).map((line, idx) => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (isSimpleFormat) {
          // V2.13.1 简化格式: 装备名,数量,位置
          return {
            key: idx,
            name: cols[0] || '',
            level: 0,
            quality: 0,
            gearScore: 0,
            quantity: parseInt(cols[1]) || 1,
            location: cols[2] || '公会仓库',
          };
        } else if (isNewFormat) {
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
        // 兜底：按简化格式处理
        return {
          key: idx,
          name: cols[0] || '',
          level: 0,
          quality: 0,
          gearScore: 0,
          quantity: parseInt(cols[1]) || 1,
          location: cols[2] || '公会仓库',
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

  // V2.10.6: 上传后进入画框模式
  const handleGridUpload = async (file: File) => {
    const localUrl = URL.createObjectURL(file);
    setGridPreviewSrc(localUrl);
    // 重置图片变换
    setImgTransform({ x: 0, y: 0, scale: 1 });
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

  // V2.12: 确认对齐后提交切图
  // 固定遮罩框位于容器中央，大小为容器的固定百分比
  // 从图片的偏移+缩放反算出 outerRect 在原图中的像素坐标
  const CONTAINER_W = 700; // 对齐容器固定宽度
  const CONTAINER_H = 550; // 对齐容器固定高度
  // 大框占容器的百分比（基于规则文档 outerRectRatio 预填，固定位置）
  // 大框根据容器类型的 cols:rows 比例自适应（保证格子是正方形）
  const getOuterRectPct = (layout: string) => {
    const { cols, rows } = getLayoutDef(layout);
    const containerW = CONTAINER_W;
    const containerH = CONTAINER_H;
    const maxW = containerW * 0.90;
    const maxH = containerH * 0.90;
    // 按 cols:rows 比例，在容器内最大化且居中
    const gridRatio = cols / rows;
    let boxW: number, boxH: number;
    if (maxW / maxH > gridRatio) {
      // 容器偏宽，以高为准
      boxH = maxH;
      boxW = boxH * gridRatio;
    } else {
      // 容器偏高，以宽为准
      boxW = maxW;
      boxH = boxW / gridRatio;
    }
    const left = ((containerW - boxW) / 2 / containerW) * 100;
    const top = ((containerH - boxH) / 2 / containerH) * 100;
    return { left, top, width: (boxW / containerW) * 100, height: (boxH / containerH) * 100 };
  };

  const getLayoutDef = (layout: string) => {
    const m: Record<string, { cols: number; rows: number }> = {
      'guild_island_chest_5x7': { cols: 5, rows: 7 }, 'army_wood_chest_5x7': { cols: 5, rows: 7 },
      'backpack_large_4x5': { cols: 4, rows: 5 }, 'backpack_medium_5x7': { cols: 5, rows: 7 },
      'backpack_small_6x8': { cols: 6, rows: 8 }, 'egg_chest_5x2': { cols: 5, rows: 2 },
    };
    return m[layout] || { cols: 5, rows: 7 };
  };

  const handleGridCutByRegion = async () => {
    if (!gridImageUrl) { message.warning('请先上传截图'); return; }
    setGridLoading(true);
    try {
      const imgEl = document.getElementById('grid-preview-img') as HTMLImageElement;
      if (!imgEl) { message.error('图片未加载'); setGridLoading(false); return; }

      const natW = imgEl.naturalWidth;
      const natH = imgEl.naturalHeight;
      const renderedW = imgEl.clientWidth;
      const displayScale = imgTransform.scale;

      const orp = getOuterRectPct(gridLayout);
      const boxLeft = CONTAINER_W * orp.left / 100;
      const boxTop = CONTAINER_H * orp.top / 100;
      const boxW = CONTAINER_W * orp.width / 100;
      const boxH = CONTAINER_H * orp.height / 100;

      const pxRatio = natW / (renderedW * displayScale);
      const origOuterRect = {
        left: Math.round((boxLeft - imgTransform.x) * pxRatio),
        top: Math.round((boxTop - imgTransform.y) * pxRatio),
        width: Math.round(boxW * pxRatio),
        height: Math.round(boxH * pxRatio),
      };

      // V2.13: Canvas 预裁剪 — 从原图中裁出装备区域再上传
      const cropLeft = Math.max(0, Math.min(origOuterRect.left, natW - 1));
      const cropTop = Math.max(0, Math.min(origOuterRect.top, natH - 1));
      const cropW = Math.min(origOuterRect.width, natW - cropLeft);
      const cropH = Math.min(origOuterRect.height, natH - cropTop);

      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imgEl, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      const croppedFile = new File([blob], 'cropped.png', { type: 'image/png' });
      const cropUploadRes: any = await uploadFile(croppedFile);
      const croppedUrl = cropUploadRes?.url || cropUploadRes?.filePath || '';

      // 裁剪后 outerRect 变为整张图（left=0, top=0）
      const outerRect = { left: 0, top: 0, width: cropW, height: cropH };

      const parseRes: any = { cells: [] }; // V3.0: 网格识别已移除
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
        matchSource: c.matchSource || '',
      }));
      for (const cell of newCells) {
        if (cell.matchedName && cell.matchedConfidence >= 0.55) {
          cell.aliasName = cell.matchedName;
        }
      }
      const merged = [...gridCells, ...newCells];
      setGridCells(merged);
      setGridPreviewSrc('');
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

  // 别名自动补全：调用参考库搜索（V2.13.1: 解析数字前缀，中文名匹配排前）
  const handleGridAliasSearch = async (index: number, keyword: string) => {
    if (!keyword || keyword.length < 1) return;
    try {
      // 解析数字前缀：如 "80长弓" → 提取中文部分 "长弓" 用于搜索
      const trimmed = keyword.trim();
      const chineseMatch = trimmed.match(/[\u4e00-\u9fa5]+/);
      const searchKey = chineseMatch ? chineseMatch[0] : trimmed;

      const res: any = await searchCatalog(searchKey);
      const list = Array.isArray(res) ? res : (res?.list || []);

      // V2.13.1: 按名称相关度排序 — 名称包含搜索词的排最前
      const sorted = [...list].sort((a: any, b: any) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        const key = searchKey.toLowerCase();
        const aExact = aName === key ? 0 : aName.includes(key) ? 1 : 2;
        const bExact = bName === key ? 0 : bName.includes(key) ? 1 : 2;
        return aExact - bExact;
      });

      const options = sorted.slice(0, 20).map((c: any) => ({
        value: c.name,
        label: `${formatEquipName(c)}${c.aliases ? ' (' + c.aliases.split(',')[0].trim() + ')' : ''}`,
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
      const res: any = { success: 0, failed: 0, failures: [] }; // V3.0: 网格识别已移除
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
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setInlineAdding(true);
              // 滚动到页面顶部确保录入区可见
              setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 80);
            }}
          >
            录入库存
          </Button>
          <Button icon={<UploadOutlined />} onClick={() => setCsvImportModal(true)}>
            CSV 导入
          </Button>
          <Space.Compact>
            <Button
              icon={<ExportOutlined />}
              loading={exporting}
              onClick={handleExportCsv}
            >
              {exportAll ? '导出全部' : `导出当前筛选${total ? `(${total}条)` : ''}`}
            </Button>
            <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 8px', border: '1px solid #d9d9d9', borderLeft: 'none', background: '#fafafa', borderRadius: '0 6px 6px 0' }}>
              <Text style={{ fontSize: 12, marginRight: 6 }}>全选</Text>
              <Switch size="small" checked={exportAll} onChange={setExportAll} />
            </span>
          </Space.Compact>
        </Space>
      </div>

      {/* V3.2: 行内录入区（移到筛选 Card 之上，确保点击"录入库存"立刻可见） */}
      {inlineAdding && (
        <Card
          size="small"
          style={{ marginBottom: 16, borderColor: '#1677ff', background: '#f0f8ff' }}
          title={<Space><PlusOutlined style={{ color: '#1677ff' }} /><Text strong>录入装备库存</Text></Space>}
          extra={
            <Button size="small" onClick={() => { setInlineAdding(false); setSelectedCatalogId(null); setCatalogOptions([]); }}>
              取消
            </Button>
          }
        >
          <Space wrap>
            <AutoComplete
              style={{ width: 280 }}
              options={catalogOptions}
              onSearch={handleCatalogSearch}
              onSelect={handleCatalogSelect}
              placeholder="搜索装备名称（输入≥1字符）"
              allowClear
            />
            <InputNumber min={0} value={inlineQuantity} onChange={(v) => setInlineQuantity(v || 1)} placeholder="数量" style={{ width: 100 }} />
            <Input value={inlineLocation} onChange={(e) => setInlineLocation(e.target.value)} placeholder="位置" style={{ width: 160 }} />
            <Button
              type="primary"
              loading={inlineSaving}
              onClick={async () => {
                if (!selectedCatalogId) { message.error('请从下拉列表选择装备'); return; }
                setInlineSaving(true);
                try {
                  await upsertInventory(guildId, { catalogId: selectedCatalogId, quantity: inlineQuantity, location: inlineLocation });
                  message.success('录入成功');
                  setSelectedCatalogId(null);
                  setInlineQuantity(1);
                  setInlineLocation('公会仓库');
                  setCatalogOptions([]);
                  fetchList();
                } catch {} finally { setInlineSaving(false); }
              }}
            >
              保存
            </Button>
          </Space>
        </Card>
      )}

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

      {/* V3.2: CSV 导入选择文件 Modal（前置，文件选择 + 模板下载） */}
      <Modal
        title="CSV 导入"
        open={csvImportModal}
        onCancel={() => setCsvImportModal(false)}
        footer={null}
        destroyOnClose
        width={520}
      >
        <Upload.Dragger
          accept=".csv,.txt"
          showUploadList={false}
          beforeUpload={(file) => {
            handleExcelFile(file);
            setCsvImportModal(false);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined style={{ fontSize: 32, color: '#1677ff' }} />
          </p>
          <p className="ant-upload-text">点击或拖拽 CSV 文件到此处</p>
          <p className="ant-upload-hint">仅支持 .csv 文件，支持简化格式（装备名,数量,位置）</p>
        </Upload.Dragger>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button type="link" icon={<DownloadOutlined />} onClick={downloadCsvTemplate}>
            下载 CSV 模板
          </Button>
        </div>
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12 }}>
          提示：装备名按"44堕神法杖"格式自动解析等级品质，需确认参考库已存在该装备（或别称）
        </Text>
      </Modal>

      {/* Excel 导入预览 */}
      <Modal title="Excel/CSV 导入预览" open={excelModal} onCancel={() => setExcelModal(false)} width={900}
        footer={<Space><Button onClick={() => setExcelModal(false)}>取消</Button><Button type="primary" loading={excelImporting} onClick={handleExcelImport}>确认导入 ({excelData.length} 条)</Button></Space>}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          推荐格式: 装备名,数量,位置（如: 44堕神法杖,20,Gpass地堡）。兼容旧格式: 别称,等级,品质,装等,数量,位置
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
                <Radio value="guild_island_chest_5x7">公会岛箱子（5×7）</Radio>
                <Radio value="army_wood_chest_5x7">军队木箱（5×7）</Radio>
                <Radio value="backpack_large_4x5">背包大（4×5）</Radio>
                <Radio value="backpack_medium_5x7">背包中（5×7）</Radio>
                <Radio value="backpack_small_6x8">背包小（6×8）</Radio>
                <Radio value="egg_chest_5x2">蛋箱（5×2）</Radio>
              </Radio.Group>
            </div>
            {/* V2.12: 固定遮罩框 + 图片拖拽缩放对齐 */}
            {gridPreviewSrc ? (
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  <b>拖动图片</b>使装备区域对齐红色框，<b>滚轮缩放</b>图片大小。红框和网格线固定不动，第一格蓝框必须对齐第一个装备。
                </Text>
                {/* 对齐容器 */}
                <div
                  style={{
                    position: 'relative', width: CONTAINER_W, height: CONTAINER_H,
                    border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden',
                    cursor: imgDragging ? 'grabbing' : 'grab', userSelect: 'none', background: '#1a1a1a',
                  }}
                  onMouseDown={(e) => {
                    setImgDragging(true);
                    setImgDragStart({ mx: e.clientX, my: e.clientY, ox: imgTransform.x, oy: imgTransform.y });
                  }}
                  onMouseMove={(e) => {
                    if (!imgDragging) return;
                    setImgTransform((prev) => ({
                      ...prev,
                      x: imgDragStart.ox + (e.clientX - imgDragStart.mx),
                      y: imgDragStart.oy + (e.clientY - imgDragStart.my),
                    }));
                  }}
                  onMouseUp={() => setImgDragging(false)}
                  onMouseLeave={() => setImgDragging(false)}
                  onWheel={(e) => {
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.03 : 0.03;
                    setImgTransform((prev) => ({ ...prev, scale: Math.max(0.1, Math.min(5, prev.scale + delta)) }));
                  }}
                >
                  {/* 图片层（可拖动+缩放，等比显示） */}
                  <img
                    id="grid-preview-img"
                    src={gridPreviewSrc}
                    alt="preview"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      left: imgTransform.x, top: imgTransform.y,
                      transform: `scale(${imgTransform.scale})`,
                      transformOrigin: '0 0',
                      maxWidth: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* 固定遮罩层：大红框 + 网格线 + 第一格蓝框（中心点定位，考虑间隙） */}
                  {(() => {
                    const orp = getOuterRectPct(gridLayout);
                    const { cols, rows } = getLayoutDef(gridLayout);
                    // 间隙比例：蓝框视觉参考（游戏内装备间隙很小约3-4%）
                    const GAP_RATIO = 0.04;
                    // 格子内容占步长的百分比（蓝框仅作视觉对齐参考，实际切图由后端 CELL_CONTENT_RATIO=0.88 控制）
                    const CELL_RATIO = 1 - GAP_RATIO;
                    // 每格步长（含间隙）
                    const stepXPct = 100 / cols;
                    const stepYPct = 100 / rows;
                    // 格子实际大小（去掉间隙）
                    const cellWPct = stepXPct * CELL_RATIO;
                    const cellHPct = stepYPct * CELL_RATIO;
                    // 间隙偏移（格子从步长中间偏移半个间隙）
                    const offsetXPct = (stepXPct - cellWPct) / 2;
                    const offsetYPct = (stepYPct - cellHPct) / 2;
                    return (
                      <>
                        <div
                          style={{
                            position: 'absolute',
                            left: `${orp.left}%`, top: `${orp.top}%`,
                            width: `${orp.width}%`, height: `${orp.height}%`,
                            border: '2px solid #ff4d4f',
                            pointerEvents: 'none',
                          }}
                        >
                          {/* 网格线（在间隙中间绘制，而非格子边界） */}
                          {Array.from({ length: cols - 1 }, (_, i) => (
                            <div key={`v${i}`} style={{ position: 'absolute', left: `${((i + 1) / cols) * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(255,77,79,0.5)' }} />
                          ))}
                          {Array.from({ length: rows - 1 }, (_, i) => (
                            <div key={`h${i}`} style={{ position: 'absolute', top: `${((i + 1) / rows) * 100}%`, left: 0, right: 0, height: 1, background: 'rgba(255,77,79,0.5)' }} />
                          ))}
                          {/* 第一格蓝色高亮（考虑间隙，比网格格子略小） */}
                          <div style={{
                            position: 'absolute',
                            left: `${offsetXPct}%`, top: `${offsetYPct}%`,
                            width: `${cellWPct}%`, height: `${cellHPct}%`,
                            border: '3px solid #1677ff', background: 'rgba(22,119,255,0.12)',
                            pointerEvents: 'none', borderRadius: 2,
                          }} />
                        </div>
                        {/* 半透明遮罩（框外区域变暗） */}
                        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${orp.top}%`, background: 'rgba(0,0,0,0.35)' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${100 - orp.top - orp.height}%`, background: 'rgba(0,0,0,0.35)' }} />
                          <div style={{ position: 'absolute', top: `${orp.top}%`, left: 0, width: `${orp.left}%`, height: `${orp.height}%`, background: 'rgba(0,0,0,0.35)' }} />
                          <div style={{ position: 'absolute', top: `${orp.top}%`, right: 0, width: `${100 - orp.left - orp.width}%`, height: `${orp.height}%`, background: 'rgba(0,0,0,0.35)' }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Space>
                    <Button type="primary" loading={gridLoading} onClick={handleGridCutByRegion}>
                      确认对齐，开始切图识别
                    </Button>
                    <Button onClick={() => setImgTransform({ x: 0, y: 0, scale: 1 })}>重置位置</Button>
                    <Button onClick={() => setGridPreviewSrc('')}>重新上传</Button>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Text type="secondary">缩放:</Text>
                      <InputNumber
                        size="small"
                        min={10}
                        max={500}
                        step={5}
                        value={Math.round(imgTransform.scale * 100)}
                        onChange={(v) => {
                          if (v !== null) setImgTransform(prev => ({ ...prev, scale: v / 100 }));
                        }}
                        style={{ width: 72 }}
                        suffix="%"
                      />
                    </span>
                  </Space>
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
              <><Spin /> <Text>识别中...</Text></>
            ) : (
              <>
                <p><AppstoreOutlined style={{ fontSize: 48, color: '#1677ff' }} /></p>
                <p style={{ fontSize: 16, fontWeight: 500 }}>点击或拖拽上传装备截图</p>
                <p style={{ fontSize: 12, color: '#999' }}>
                  上传后拖动红色网格框对齐装备区域，第一格蓝色高亮对齐第一个装备，确认后系统自动切图识别。
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
            {/* V2.13.1: 批量设置位置 */}
            {gridSelectedKeys.length > 0 && (
              <Space style={{ marginTop: 8 }}>
                <Text type="secondary">已选 {gridSelectedKeys.length} 条</Text>
                <Input
                  size="small"
                  placeholder="输入位置"
                  value={gridBatchLocation}
                  style={{ width: 150 }}
                  onChange={(e) => setGridBatchLocation(e.target.value)}
                />
                <Button size="small" type="primary" disabled={!gridBatchLocation.trim()} onClick={() => {
                  setGridCells(prev => prev.map(c => {
                    if (gridSelectedKeys.includes(`${c.row}-${c.col}`)) {
                      return { ...c, location: gridBatchLocation.trim() };
                    }
                    return c;
                  }));
                  message.success(`已批量设置 ${gridSelectedKeys.length} 条位置`);
                  setGridSelectedKeys([]);
                  setGridBatchLocation('');
                }}>批量设置位置</Button>
              </Space>
            )}
            <Table
              size="small"
              rowKey={(r) => `${r.row}-${r.col}`}
              dataSource={gridOnlyUnfilled ? gridCells.filter(c => !c.aliasName?.trim()) : gridCells}
              pagination={{ pageSize: 15, showSizeChanger: false }}
              rowSelection={{
                selectedRowKeys: gridSelectedKeys,
                onChange: (keys) => setGridSelectedKeys(keys as string[]),
              }}
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
                  title: '装备名称', width: 200,
                  render: (_: any, row: any) => {
                    const idx = gridCells.findIndex(c => c.row === row.row && c.col === row.col);
                    // Layer 6: 置信度颜色
                    const conf = row.matchedConfidence || 0;
                    const bgColor = conf >= 0.75 ? '#f6ffed' : conf >= 0.55 ? '#fffbe6' : '#fff2f0';
                    const borderColor = conf >= 0.75 ? '#b7eb8f' : conf >= 0.55 ? '#ffe58f' : '#ffccc7';
                    return (
                      <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 4, padding: 2 }}>
                        <AutoComplete
                          value={row.aliasName}
                          placeholder="输入装备名..."
                          style={{ width: '100%' }}
                          options={row.aliasOptions || []}
                          onSearch={(kw) => handleGridAliasSearch(idx, kw)}
                          onChange={(v) => handleGridCellChange(idx, 'aliasName', v)}
                          allowClear
                        />
                        {conf > 0 && <span style={{ fontSize: 11, color: conf >= 0.75 ? '#52c41a' : conf >= 0.55 ? '#faad14' : '#ff4d4f' }}>{(conf * 100).toFixed(0)}% {row.matchSource ? `(${row.matchSource})` : ''}</span>}

                      </div>
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
          <Timeline items={logs.map((log: any) => {
            const actionMap: Record<string, string> = {
              manual_add: '手动录入',
              manual_edit: '手动修改',
              csv_import: '表格上传',
              ocr_import: '网格识别添加',
              resupply_deduct: '死亡补装扣减',
              oc_deduct: 'OC碎扣减',
              delete: '删除',
            };
            const actionLabel = actionMap[log.action] || log.action;
            const isAdd = log.delta > 0;
            return {
              color: isAdd ? 'green' : log.delta < 0 ? 'red' : 'gray',
              children: (
                <div key={log.id}>
                  <Text strong>{actionLabel}</Text>
                  <Text type={isAdd ? 'success' : 'danger'}> {isAdd ? '+' : ''}{log.delta}</Text>
                  <Text type="secondary"> （{log.beforeQuantity} → {log.afterQuantity}）</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>{log.operatorName || '系统'} · {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}</Text>
                  {log.remark && <><br /><Text type="secondary" style={{ fontSize: 12 }}>{log.remark}</Text></>}
                </div>
              ),
            };
          })} />
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

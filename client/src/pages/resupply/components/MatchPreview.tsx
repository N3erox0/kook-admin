import { useState, useEffect } from 'react';
import { Card, Row, Col, Checkbox, Button, Table, Tag, Image, Space, Typography, message, Spin, Empty } from 'antd';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { previewMatchResupply, previewMatchFromUrl } from '@/api/resupply';

const { Text } = Typography;

export interface MatchBox {
  boxId: string;
  cropBase64: string;
  rect: { left: number; top: number; width: number; height: number };
  candidates: Array<{
    catalogId: number;
    name: string;
    imageUrl: string | null;
    level: number;
    quality: number;
    category: string;
    gearScore: number;
    similarity: number;
    autoChecked: boolean;
  }>;
  selectedCatalogId: number | null;
  checked: boolean;
}

export interface MatchPreviewData {
  originalUrl: string;
  imgWidth: number;
  imgHeight: number;
  boxes: MatchBox[];
}

export interface ConfirmedItem {
  catalogId: number;
  name: string;
  gearScore: number;
  category: string;
  quantity: number;
}

interface Props {
  guildId: number;
  /** 通过补装申请 id 预览（优先） */
  resupplyId?: number;
  /** 通过图片 URL 预览（待识别 Tab 用） */
  imageUrl?: string;
  /** 自动勾选阈值（默认 0.80） */
  autoThreshold?: number;
  /** 每个方框 Top N 候选（默认 5） */
  topN?: number;
  /** 用户点击"确认勾选项"后回调（用于父组件把结果填入补装装备列表） */
  onConfirm: (items: ConfirmedItem[]) => void;
  /** 自定义确认按钮文案 */
  confirmText?: string;
}

/**
 * V2.9.3 图像识别预览组件
 * - 左侧：原图预览（带红框标注已勾选方框）
 * - 右上：检测到的方框列表（小图+勾选）
 * - 下方：匹配结果表格（相似度排序，≥80%自动勾选），每行可展开查看 Top5 候选
 * - 底部：确认按钮，回调传出选中的装备列表
 */
export default function MatchPreview({
  guildId, resupplyId, imageUrl,
  autoThreshold = 0.80, topN = 5,
  onConfirm, confirmText = '确认勾选项',
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MatchPreviewData | null>(null);

  const fetchPreview = async () => {
    if (!resupplyId && !imageUrl) { message.warning('缺少截图，无法预览'); return; }
    setLoading(true);
    try {
      let res: any;
      if (resupplyId) {
        res = await previewMatchResupply(guildId, resupplyId, { topN, autoThreshold });
      } else {
        res = await previewMatchFromUrl(guildId, { imageUrl: imageUrl!, topN, autoThreshold });
      }
      setData(res);
      if (!res?.boxes?.length) {
        message.info('未检测到装备方框，请确认图片为装备截图且参考库已初始化');
      }
    } catch (err: any) {
      message.error(err?.message || '预览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPreview(); /* eslint-disable-line */ }, [resupplyId, imageUrl]);

  const toggleBoxChecked = (boxId: string) => {
    setData(d => d && ({
      ...d,
      boxes: d.boxes.map(b => b.boxId === boxId ? { ...b, checked: !b.checked } : b),
    }));
  };

  const selectCandidate = (boxId: string, catalogId: number) => {
    setData(d => d && ({
      ...d,
      boxes: d.boxes.map(b => b.boxId === boxId
        ? { ...b, selectedCatalogId: catalogId, checked: true }
        : b),
    }));
  };

  const handleConfirm = () => {
    if (!data) return;
    const picked = data.boxes.filter(b => b.checked && b.selectedCatalogId);
    if (picked.length === 0) { message.warning('请至少勾选一个方框'); return; }
    // 合并同 catalogId（累加数量=方框数）
    const merged = new Map<number, ConfirmedItem>();
    for (const b of picked) {
      const cand = b.candidates.find(c => c.catalogId === b.selectedCatalogId);
      if (!cand) continue;
      const ex = merged.get(cand.catalogId);
      if (ex) ex.quantity += 1;
      else merged.set(cand.catalogId, {
        catalogId: cand.catalogId,
        name: cand.name,
        gearScore: cand.gearScore,
        category: cand.category,
        quantity: 1,
      });
    }
    onConfirm(Array.from(merged.values()));
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="识别中..." /></div>;
  if (!data) return <Empty description="暂无预览数据" />;
  if (data.boxes.length === 0) {
    return (
      <Empty description="未检测到装备方框">
        <Button icon={<ReloadOutlined />} onClick={fetchPreview}>重新识别</Button>
      </Empty>
    );
  }

  const checkedCount = data.boxes.filter(b => b.checked).length;

  return (
    <div>
      {/* 顶部：原图 + 方框列表 */}
      <Row gutter={12}>
        <Col span={10}>
          <Card size="small" title="原图预览" bodyStyle={{ padding: 8 }}>
            <div style={{ position: 'relative', lineHeight: 0 }}>
              <img src={data.originalUrl} alt="原图"
                style={{ width: '100%', borderRadius: 4, display: 'block' }} />
              {data.boxes.filter(b => b.checked).map(b => (
                <div key={b.boxId} style={{
                  position: 'absolute',
                  left: `${(b.rect.left / data.imgWidth) * 100}%`,
                  top: `${(b.rect.top / data.imgHeight) * 100}%`,
                  width: `${(b.rect.width / data.imgWidth) * 100}%`,
                  height: `${(b.rect.height / data.imgHeight) * 100}%`,
                  border: '2px solid #f5222d',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                }} />
              ))}
            </div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              红框 = 已勾选的方框
            </Text>
          </Card>
        </Col>
        <Col span={14}>
          <Card size="small" title={`检测到的方框 (${data.boxes.length})`}
            bodyStyle={{ padding: 8, maxHeight: 260, overflow: 'auto' }}
            extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchPreview}>重新识别</Button>}
          >
            <Row gutter={[8, 8]}>
              {data.boxes.map(b => {
                const top = b.candidates[0];
                return (
                  <Col key={b.boxId}>
                    <div style={{
                      textAlign: 'center',
                      border: b.checked ? '2px solid #1677ff' : '1px solid #d9d9d9',
                      borderRadius: 6, padding: 4, background: '#fff',
                    }}>
                      <img src={b.cropBase64} alt={b.boxId}
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                      <Checkbox checked={b.checked} onChange={() => toggleBoxChecked(b.boxId)}
                        style={{ fontSize: 11, marginTop: 2 }}>
                        选中
                      </Checkbox>
                      {top && (
                        <div style={{ fontSize: 10, color: top.similarity >= autoThreshold ? '#52c41a' : '#fa8c16' }}>
                          {(top.similarity * 100).toFixed(0)}%
                        </div>
                      )}
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 匹配结果表格 */}
      <Card size="small" title="匹配结果（按相似度排序）" style={{ marginTop: 12 }}
        bodyStyle={{ padding: 0 }}>
        <Table
          size="small"
          rowKey="boxId"
          pagination={false}
          scroll={{ y: 320 }}
          dataSource={[...data.boxes].sort((a, b) =>
            (b.candidates[0]?.similarity || 0) - (a.candidates[0]?.similarity || 0),
          )}
          expandable={{
            expandedRowRender: (box) => (
              <Table
                rowKey="catalogId"
                size="small"
                pagination={false}
                dataSource={box.candidates}
                columns={[
                  {
                    title: '选择', width: 50,
                    render: (_: any, c: any) => (
                      <Checkbox checked={box.selectedCatalogId === c.catalogId}
                        onChange={() => selectCandidate(box.boxId, c.catalogId)} />
                    ),
                  },
                  {
                    title: '图片', width: 60, dataIndex: 'imageUrl',
                    render: (url: string) => url
                      ? <Image src={url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} />
                      : <Text type="secondary">无</Text>,
                  },
                  { title: '名称', dataIndex: 'name' },
                  {
                    title: '装等', width: 70,
                    render: (_: any, c: any) => c.gearScore ? `P${c.gearScore}` : '-',
                  },
                  { title: '部位', dataIndex: 'category', width: 70 },
                  {
                    title: '相似度', dataIndex: 'similarity', width: 90,
                    render: (v: number) => (
                      <Tag color={v >= autoThreshold ? 'green' : v >= 0.70 ? 'orange' : 'default'}>
                        {(v * 100).toFixed(0)}%
                      </Tag>
                    ),
                  },
                ]}
              />
            ),
          }}
          columns={[
            {
              title: '启用', dataIndex: 'checked', width: 60,
              render: (_: any, b: MatchBox) => (
                <Checkbox checked={b.checked} onChange={() => toggleBoxChecked(b.boxId)} />
              ),
            },
            {
              title: '方框', width: 70,
              render: (_: any, b: MatchBox) => (
                <img src={b.cropBase64} alt={b.boxId}
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
              ),
            },
            {
              title: '当前选择', key: 'selected',
              render: (_: any, b: MatchBox) => {
                const c = b.candidates.find(x => x.catalogId === b.selectedCatalogId)
                  || b.candidates[0];
                if (!c) return <Text type="secondary">无候选</Text>;
                return (
                  <Space>
                    {c.imageUrl && <Image src={c.imageUrl} width={28} height={28}
                      style={{ objectFit: 'cover', borderRadius: 4 }} />}
                    <Text>{c.name}</Text>
                    {c.gearScore > 0 && <Tag>P{c.gearScore}</Tag>}
                  </Space>
                );
              },
            },
            {
              title: '最佳相似度', width: 100,
              render: (_: any, b: MatchBox) => {
                const top = b.candidates[0];
                if (!top) return '-';
                return (
                  <Tag color={top.similarity >= autoThreshold ? 'green' : top.similarity >= 0.70 ? 'orange' : 'default'}>
                    {(top.similarity * 100).toFixed(0)}%
                  </Tag>
                );
              },
            },
            {
              title: '候选数', width: 70, dataIndex: 'candidates',
              render: (arr: any[]) => arr.length,
            },
          ]}
        />
      </Card>

      {/* 底部：确认操作 */}
      <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">
          已勾选 <b style={{ color: '#1677ff' }}>{checkedCount}</b> / {data.boxes.length} 个方框
          （阈值 ≥{(autoThreshold * 100).toFixed(0)}% 自动勾选）
        </Text>
        <Space>
          <Button onClick={() => setData(d => d && ({
            ...d,
            boxes: d.boxes.map(b => ({ ...b, checked: false })),
          }))}>
            全部取消
          </Button>
          <Button onClick={() => setData(d => d && ({
            ...d,
            boxes: d.boxes.map(b => ({
              ...b,
              checked: !!(b.candidates[0] && b.candidates[0].similarity >= autoThreshold),
              selectedCatalogId: b.candidates[0]?.autoChecked ? b.candidates[0].catalogId : null,
            })),
          }))}>
            按阈值重置
          </Button>
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleConfirm}
            disabled={checkedCount === 0}>
            {confirmText}（{checkedCount}件）
          </Button>
        </Space>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Tag, Typography, message, Modal, Image, Popconfirm } from 'antd';
import { ReloadOutlined, CheckOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { getKookPending, getOcrBatchDetail, confirmOcrItem, confirmAllOcrItems, saveOcrToInventory } from '@/api/ocr';
import { useGuildStore } from '@/stores/guild.store';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const BATCH_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待识别', color: 'orange' },
  recognized: { label: '已识别', color: 'blue' },
  confirmed: { label: '已确认', color: 'green' },
  saved: { label: '已入库', color: 'cyan' },
  failed: { label: '失败', color: 'red' },
};

const ITEM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'orange' },
  confirmed: { label: '已确认', color: 'green' },
  discarded: { label: '已丢弃', color: 'red' },
  saved: { label: '已入库', color: 'cyan' },
};

export default function KookPendingPage() {
  const { currentGuildId } = useGuildStore();
  const guildId = currentGuildId!;

  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const [detailModal, setDetailModal] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchList = async (p = page) => {
    if (!guildId) return;
    setLoading(true);
    try {
      const res: any = await getKookPending(guildId, { page: p, pageSize: 20 });
      setList(res?.list || []);
      setTotal(res?.total || 0);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchList(1); }, [guildId]);

  const openDetail = async (batchId: number) => {
    setDetailModal(true);
    setDetailLoading(true);
    try {
      const res: any = await getOcrBatchDetail(guildId, batchId);
      setDetail(res);
    } catch {} finally { setDetailLoading(false); }
  };

  const handleConfirmItem = async (itemId: number, status: 'confirmed' | 'discarded') => {
    try {
      await confirmOcrItem(guildId, itemId, { status });
      message.success(status === 'confirmed' ? '已确认' : '已丢弃');
      if (detail?.id) openDetail(detail.id);
    } catch {}
  };

  const handleConfirmAll = async (batchId: number) => {
    try {
      await confirmAllOcrItems(guildId, batchId);
      message.success('全部确认');
      if (detail?.id === batchId) openDetail(batchId);
      fetchList();
    } catch {}
  };

  const handleSaveToInventory = async (batchId: number) => {
    try {
      await saveOcrToInventory(guildId, batchId);
      message.success('已入库');
      fetchList();
      setDetailModal(false);
    } catch {}
  };

  const columns: any[] = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '状态', dataIndex: 'status', width: 80,
      render: (v: string) => {
        const info = BATCH_STATUS_MAP[v] || { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: 'KOOK用户', dataIndex: 'uploadUserName', width: 140, ellipsis: true },
    { title: '装备数', dataIndex: 'totalItems', width: 70 },
    {
      title: '截图', dataIndex: 'imageUrl', width: 80,
      render: (v: string) => v ? <Image src={v} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} /> : '-',
    },
    {
      title: '时间', dataIndex: 'createdAt', width: 140,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', width: 120,
      render: (_: any, r: any) => (
        <Space size="small">
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => openDetail(r.id)}>查看</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>KOOK 待识别工作区</Title>
        <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>刷新</Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          size="middle"
          pagination={{ current: page, total, pageSize: 20, showTotal: t => `共 ${t} 条`, onChange: p => { setPage(p); fetchList(p); } }}
        />
      </Card>

      <Modal
        title="待识别批次详情"
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={700}
        centered
        footer={detail && detail.status === 'recognized' ? (
          <Space>
            <Popconfirm title="全部确认？" onConfirm={() => handleConfirmAll(detail.id)}>
              <Button type="primary" icon={<CheckOutlined />}>全部确认</Button>
            </Popconfirm>
          </Space>
        ) : detail && detail.status === 'confirmed' ? (
          <Popconfirm title="确认入库？" onConfirm={() => handleSaveToInventory(detail.id)}>
            <Button type="primary">入库</Button>
          </Popconfirm>
        ) : null}
      >
        {detailLoading ? <Text>加载中...</Text> : detail && (
          <div>
            <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
              <div><Text strong>批次号：</Text>{detail.batchNo}</div>
              <div><Text strong>KOOK用户：</Text>{detail.uploadUserName || '-'}</div>
              <div><Text strong>状态：</Text><Tag color={BATCH_STATUS_MAP[detail.status]?.color}>{BATCH_STATUS_MAP[detail.status]?.label}</Tag></div>
              {detail.imageUrl && (
                <div><Text strong>截图：</Text><br /><Image src={detail.imageUrl} width={300} style={{ marginTop: 4, borderRadius: 8 }} /></div>
              )}
            </Space>
            {detail.items?.length > 0 && (
              <Table
                dataSource={detail.items}
                rowKey="id"
                size="small"
                pagination={false}
                columns={[
                  { title: '装备名', dataIndex: 'equipmentName', width: 160 },
                  { title: '匹配库名', dataIndex: 'matchedCatalogName', width: 140 },
                  {
                    title: '置信度', dataIndex: 'confidence', width: 80,
                    render: (v: number) => v ? <Text type={v >= 70 ? 'success' : 'warning'}>{v}%</Text> : '-',
                  },
                  { title: '数量', dataIndex: 'quantity', width: 60 },
                  {
                    title: '状态', dataIndex: 'status', width: 80,
                    render: (v: string) => {
                      const info = ITEM_STATUS_MAP[v] || { label: v, color: 'default' };
                      return <Tag color={info.color}>{info.label}</Tag>;
                    },
                  },
                  {
                    title: '操作', key: 'actions', width: 120,
                    render: (_: any, r: any) => r.status === 'pending' ? (
                      <Space size="small">
                        <Button size="small" type="link" onClick={() => handleConfirmItem(r.id, 'confirmed')}>
                          <CheckOutlined /> 确认
                        </Button>
                        <Button size="small" type="link" danger onClick={() => handleConfirmItem(r.id, 'discarded')}>
                          <DeleteOutlined /> 丢弃
                        </Button>
                      </Space>
                    ) : null,
                  },
                ]}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

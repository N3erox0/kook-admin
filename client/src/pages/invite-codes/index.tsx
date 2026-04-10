import { useState, useEffect } from 'react';
import { Card, Table, Button, Tag, Space, Modal, Form, InputNumber, Input, Typography, message, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { getAllInviteCodes, generateInviteCodes, updateInviteCodeStatus } from '@/api/guild';
import { INVITE_CODE_STATUS } from '@/types';
import type { InviteCode } from '@/types';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function InviteCodePage() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res: any = await getAllInviteCodes();
      setCodes(res || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCodes(); }, []);

  const handleGenerate = async (values: { count: number; prefix?: string; remark?: string }) => {
    setGenerateLoading(true);
    try {
      await generateInviteCodes(values);
      message.success(`成功生成 ${values.count} 个邀请码`);
      setGenerateModalOpen(false);
      form.resetFields();
      fetchCodes();
    } catch {
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateInviteCodeStatus(id, status);
      message.success('状态更新成功');
      fetchCodes();
    } catch {
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => message.success('已复制'));
  };

  const columns = [
    {
      title: '邀请码',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <Space>
          <code style={{ fontSize: 13, fontWeight: 600 }}>{code}</code>
          <Tooltip title="复制">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyCode(code)} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const info = INVITE_CODE_STATUS[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '绑定公会',
      dataIndex: 'boundGuildName',
      key: 'boundGuildName',
      render: (name: string | null) => name || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: string | null) => v || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '使用时间',
      dataIndex: 'usedAt',
      key: 'usedAt',
      width: 170,
      render: (v: string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: InviteCode) => {
        if (record.status === 'used') {
          return <Tag>已使用（不可修改）</Tag>;
        }
        return (
          <Space size="small">
            {record.status !== 'enabled' && (
              <Popconfirm title="确认启用此邀请码？" onConfirm={() => handleStatusChange(record.id, 'enabled')}>
                <Button size="small" type="link">启用</Button>
              </Popconfirm>
            )}
            {record.status !== 'disabled' && record.status !== 'revoked' && (
              <Popconfirm title="确认停用此邀请码？" onConfirm={() => handleStatusChange(record.id, 'disabled')}>
                <Button size="small" type="link">停用</Button>
              </Popconfirm>
            )}
            {record.status !== 'revoked' && (
              <Popconfirm title="确认作废此邀请码？作废后不可恢复" onConfirm={() => handleStatusChange(record.id, 'revoked')}>
                <Button size="small" type="link" danger>作废</Button>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>邀请码管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchCodes}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setGenerateModalOpen(true)}>
            生成邀请码
          </Button>
        </Space>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={codes}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 条` }}
          size="middle"
        />
      </Card>

      <Modal
        title="生成邀请码"
        open={generateModalOpen}
        onCancel={() => { setGenerateModalOpen(false); form.resetFields(); }}
        footer={null}
      >
        <Form form={form} onFinish={handleGenerate} layout="vertical" initialValues={{ count: 5, prefix: 'KOOK' }}>
          <Form.Item name="count" label="生成数量" rules={[{ required: true }]}>
            <InputNumber min={1} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="prefix" label="编码前缀">
            <Input placeholder="默认 KOOK" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={generateLoading} block>
              生成
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

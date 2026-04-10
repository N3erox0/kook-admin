import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Form, Input, Button, Typography, Steps, Result, message } from 'antd';
import { KeyOutlined, TeamOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { validateInviteCode, createGuild } from '@/api/guild';
import { useGuildStore } from '@/stores/guild.store';

const { Title, Text } = Typography;

export default function GuildCreatePage() {
  const navigate = useNavigate();
  const { setGuilds, selectGuild, guilds } = useGuildStore();
  const [step, setStep] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(false);

  const handleValidate = async () => {
    if (!inviteCode.trim()) {
      message.warning('请输入邀请码');
      return;
    }
    setLoading(true);
    try {
      const res: any = await validateInviteCode(inviteCode);
      if (res.valid) {
        message.success('邀请码有效');
        setStep(1);
      } else {
        message.error(res.message);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: { name: string; kookGuildId: string }) => {
    setLoading(true);
    try {
      const res: any = await createGuild({
        inviteCode,
        name: values.name,
        kookGuildId: values.kookGuildId,
      });
      message.success('公会创建成功');
      setCreated(true);
      setStep(2);
      // 更新公会列表
      const newGuild = { guildId: res.id, guildName: res.name, guildIcon: res.iconUrl, role: 'super_admin' };
      setGuilds([...guilds, newGuild]);
      selectGuild(res.id);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#f0f2f5', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <Card style={{ width: 520, borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3}>创建公会</Title>
        </div>

        <Steps current={step} style={{ marginBottom: 32 }}
          items={[
            { title: '验证邀请码', icon: <KeyOutlined /> },
            { title: '填写信息', icon: <TeamOutlined /> },
            { title: '完成', icon: <CheckCircleOutlined /> },
          ]}
        />

        {step === 0 && (
          <div>
            <Form.Item label="邀请码">
              <Input
                size="large" placeholder="请输入邀请码" value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                onPressEnter={handleValidate}
              />
            </Form.Item>
            <Button type="primary" block size="large" loading={loading} onClick={handleValidate}>
              验证
            </Button>
            <Button block size="large" style={{ marginTop: 8 }} onClick={() => navigate('/guild/select')}>
              返回
            </Button>
          </div>
        )}

        {step === 1 && (
          <Form onFinish={handleCreate} layout="vertical" size="large">
            <Form.Item name="name" label="公会名称" rules={[{ required: true, message: '请输入公会名称' }]}>
              <Input placeholder="2-20个字符" maxLength={20} />
            </Form.Item>
            <Form.Item name="kookGuildId" label="KOOK 服务器 ID" rules={[{ required: true, message: '请输入KOOK服务器ID' }]}>
              <Input placeholder="在KOOK中获取服务器ID" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>创建公会</Button>
            <Button block style={{ marginTop: 8 }} onClick={() => setStep(0)}>上一步</Button>
          </Form>
        )}

        {step === 2 && (
          <Result
            status="success"
            title="公会创建成功"
            subTitle="你已成为该公会的超级管理员"
            extra={
              <Button type="primary" onClick={() => navigate('/dashboard')}>
                进入控制台
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}

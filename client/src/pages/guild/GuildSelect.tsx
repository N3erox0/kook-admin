import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, List, Avatar, Button, Typography, Empty, Space, Tag } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useGuildStore } from '@/stores/guild.store';
import { useAuthStore } from '@/stores/auth.store';
import { getProfile } from '@/api/auth';
import { ROLE_LABELS } from '@/types';

const { Title, Text } = Typography;

export default function GuildSelectPage() {
  const navigate = useNavigate();
  const { guilds, setGuilds, selectGuild } = useGuildStore();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getProfile().then((res: any) => {
      if (res?.guilds) setGuilds(res.guilds);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSelect = (guildId: number) => {
    selectGuild(guildId);
    navigate('/admin/dashboard');
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#f0f2f5', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <Card style={{ width: 520, borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3}>选择公会</Title>
          <Text type="secondary">请选择要管理的公会</Text>
        </div>

        {guilds.length > 0 ? (
          <List
            loading={loading}
            dataSource={guilds}
            renderItem={(item) => (
              <List.Item
                style={{ cursor: 'pointer', borderRadius: 8, padding: '12px 16px', marginBottom: 8, border: '1px solid #f0f0f0' }}
                onClick={() => handleSelect(item.guildId)}
                actions={[<Tag color="blue">{ROLE_LABELS[item.role] || item.role}</Tag>]}
              >
                <List.Item.Meta
                  avatar={item.guildIcon
                    ? <Avatar src={item.guildIcon} shape="square" />
                    : <Avatar icon={<TeamOutlined />} shape="square" style={{ background: '#1890ff' }} />
                  }
                  title={item.guildName}
                />
              </List.Item>
            )}
          />
        ) : (
          <Empty description="暂无公会" style={{ margin: '32px 0' }} />
        )}

        <Space style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/guild/create')}>
            创建新公会
          </Button>
        </Space>
      </Card>
    </div>
  );
}

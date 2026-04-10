import { useNavigate } from 'react-router-dom';
import { Typography, Button, Space, Card, Row, Col } from 'antd';
import {
  DashboardOutlined, TeamOutlined, AppstoreOutlined,
  SyncOutlined, AlertOutlined, FileTextOutlined,
  RocketOutlined, KeyOutlined, LoginOutlined,
} from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const features = [
  { icon: <DashboardOutlined style={{ fontSize: 32, color: '#1677ff' }} />, title: '控制台', desc: '数据统计、新增/离开成员列表，一目了然掌握公会动态' },
  { icon: <TeamOutlined style={{ fontSize: 32, color: '#52c41a' }} />, title: '成员管理', desc: 'KOOK 成员自动同步、角色分配、在会天数追踪' },
  { icon: <AppstoreOutlined style={{ fontSize: 32, color: '#722ed1' }} />, title: '装备库存', desc: 'Excel 批量导入、OCR 智能识别入库、完整变动日志' },
  { icon: <SyncOutlined style={{ fontSize: 32, color: '#fa8c16' }} />, title: '补装管理', desc: '击杀详情自动识别、智能去重、审批流转、库存自动扣减' },
  { icon: <AlertOutlined style={{ fontSize: 32, color: '#f5222d' }} />, title: '预警系统', desc: '库存预警 + 死亡次数预警，KOOK 卡片消息自动推送' },
  { icon: <FileTextOutlined style={{ fontSize: 32, color: '#13c2c2' }} />, title: '日志系统', desc: '操作日志 + 消息推送记录，所有操作可追溯' },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0a1628 0%, #1a3a5c 50%, #0d2240 100%)',
        padding: '80px 24px 100px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'radial-gradient(circle at 30% 50%, rgba(22,119,255,0.15) 0%, transparent 60%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 800, margin: '0 auto' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18,
            background: 'linear-gradient(135deg, #1677ff, #0050b3)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24, boxShadow: '0 8px 24px rgba(22,119,255,0.4)',
          }}>
            <RocketOutlined style={{ fontSize: 36, color: '#fff' }} />
          </div>
          <Title style={{ color: '#fff', fontSize: 42, marginBottom: 8, fontWeight: 700 }}>
            KOOK 公会助手
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.75)', fontSize: 18, marginBottom: 40 }}>
            专为 KOOK 游戏公会打造的一站式装备库存、补装审批与预警管理系统
          </Paragraph>
          <Space size={16} wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" size="large" icon={<LoginOutlined />}
              style={{ height: 48, padding: '0 32px', fontSize: 16, borderRadius: 8 }}
              onClick={() => navigate('/login')}>
              公会管理员登录
            </Button>
            <Button size="large" icon={<KeyOutlined />}
              style={{ height: 48, padding: '0 32px', fontSize: 16, borderRadius: 8, background: '#faad14', borderColor: '#faad14', color: '#fff' }}
              onClick={() => navigate('/join')}>
              邀请码创建公会
            </Button>
          </Space>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <Title level={2}>功能模块</Title>
          <Text type="secondary" style={{ fontSize: 16 }}>覆盖公会管理全流程</Text>
        </div>
        <Row gutter={[24, 24]}>
          {features.map((f, i) => (
            <Col xs={24} sm={12} md={8} key={i}>
              <Card hoverable style={{ height: '100%', borderRadius: 12, textAlign: 'center' }}
                bodyStyle={{ padding: '32px 24px' }}>
                <div style={{ marginBottom: 16 }}>{f.icon}</div>
                <Title level={4} style={{ marginBottom: 8 }}>{f.title}</Title>
                <Text type="secondary">{f.desc}</Text>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* Tech Stack */}
      <div style={{ background: '#fafafa', padding: '60px 24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <Title level={3}>技术架构</Title>
          <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
            {[
              { label: '前端', tech: 'React 18 + TypeScript + Ant Design 5' },
              { label: '后端', tech: 'NestJS + TypeORM + MySQL' },
              { label: '集成', tech: 'KOOK Bot API + 腾讯云 OCR' },
              { label: '部署', tech: 'PM2 + Nginx' },
            ].map((item, i) => (
              <Col xs={12} sm={6} key={i}>
                <Card size="small" style={{ borderRadius: 8, textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                  <br />
                  <Text strong style={{ fontSize: 13 }}>{item.tech}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: '#0a1628', padding: '32px 24px',
        textAlign: 'center', borderTop: '1px solid #1a2a4a',
      }}>
        <Space direction="vertical" size={4}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            KOOK 公会助手 &copy; {new Date().getFullYear()}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              style={{ color: 'rgba(255,255,255,0.35)' }}>
              粤ICP备2026037673号-1
            </a>
          </Text>
        </Space>
      </div>
    </div>
  );
}

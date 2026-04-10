import { useNavigate } from 'react-router-dom';
import { Typography, Button, Space, Card, Row, Col } from 'antd';
import {
  DashboardOutlined, TeamOutlined, AppstoreOutlined,
  SyncOutlined, AlertOutlined, FileTextOutlined,
  KeyOutlined, LoginOutlined,
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

const bannerImages = [
  '/images/banner-1.png',
  '/images/banner-2.webp',
  '/images/banner-3.jpg',
  '/images/banner-4.jpg',
];

const slogans = [
  { img: 0, title: '告别补装混乱', desc: '截图自动识别装备，一键生成补装申请，审批流转清晰透明，再也不怕漏补错补。' },
  { img: 1, title: '库存尽在掌握', desc: '实时追踪每一件装备的数量与流向，低库存自动预警，让公会仓库永远井然有序。' },
  { img: 2, title: '团战无后顾之忧', desc: '死亡次数智能统计，补装审批通过即扣减库存，每一次出征都有最坚实的后勤保障。' },
  { img: 3, title: '让管理回归简单', desc: '从成员同步到装备发放，从库存盘点到预警推送，一个系统搞定公会管理全部琐事。' },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1a' }}>
      {/* 顶部导航栏 */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 32px',
      }}>
        <Text strong style={{ color: '#fff', fontSize: 18 }}>22BN公会助手</Text>
        <Space size={12}>
          <Button type="link" style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}
            onClick={() => navigate('/join')}>
            <KeyOutlined /> 邀请码注册
          </Button>
          <Button type="primary" size="small"
            style={{ borderRadius: 6 }}
            onClick={() => navigate('/login')}>
            <LoginOutlined /> 管理员登录
          </Button>
        </Space>
      </div>

      {/* Hero - 文字居中在头图上 */}
      <div style={{
        position: 'relative',
        height: '100vh',
        minHeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `url(${bannerImages[0]})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'brightness(0.3)',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(10,15,26,0.2) 0%, rgba(10,15,26,0.7) 70%, #0a0f1a 100%)',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 700, padding: '0 24px' }}>
          <Title style={{ color: '#fff', fontSize: 52, marginBottom: 12, fontWeight: 800, letterSpacing: 2 }}>
            22BN公会助手
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.85)', fontSize: 22, marginBottom: 16 }}>
            专为游戏公会打造的一站式管理系统
          </Paragraph>
          <Paragraph style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, marginBottom: 40 }}>
            库存管理 · 补装审批 · 智能预警 · 成员追踪
          </Paragraph>
          <Space size={16} wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" size="large"
              style={{ height: 50, padding: '0 40px', fontSize: 16, borderRadius: 10 }}
              onClick={() => navigate('/join')}>
              邀请码创建公会
            </Button>
            <Button size="large" ghost
              style={{ height: 50, padding: '0 40px', fontSize: 16, borderRadius: 10, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
              onClick={() => navigate('/login')}>
              管理员登录
            </Button>
          </Space>
        </div>
      </div>

      {/* 广告语 + 图片交替展示 */}
      {slogans.map((s, i) => {
        const isReversed = i % 2 === 1;
        return (
          <div key={i} style={{
            background: i % 2 === 0 ? '#0d1422' : '#111827',
            padding: '60px 24px',
          }}>
            <div style={{ maxWidth: 1000, margin: '0 auto' }}>
              <Row gutter={[48, 32]} align="middle"
                style={{ flexDirection: isReversed ? 'row-reverse' : 'row' }}>
                <Col xs={24} md={12}>
                  <div style={{ overflow: 'hidden', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                    <img
                      src={bannerImages[s.img]}
                      alt={s.title}
                      style={{ width: '100%', display: 'block', transition: 'transform 0.3s' }}
                      onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
                      onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                    />
                  </div>
                </Col>
                <Col xs={24} md={12}>
                  <Title level={2} style={{ color: '#fff', marginBottom: 12 }}>{s.title}</Title>
                  <Paragraph style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1.8 }}>
                    {s.desc}
                  </Paragraph>
                </Col>
              </Row>
            </div>
          </div>
        );
      })}

      {/* Features */}
      <div style={{ background: '#0a0f1a', padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <Title level={2} style={{ color: '#fff' }}>功能模块</Title>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>覆盖公会管理全流程</Text>
          </div>
          <Row gutter={[24, 24]}>
            {features.map((f, i) => (
              <Col xs={24} sm={12} md={8} key={i}>
                <Card hoverable style={{
                  height: '100%', borderRadius: 12, textAlign: 'center',
                  background: '#151d2e', border: '1px solid #1e293b',
                }}
                  bodyStyle={{ padding: '32px 24px' }}>
                  <div style={{ marginBottom: 16 }}>{f.icon}</div>
                  <Title level={4} style={{ marginBottom: 8, color: '#fff' }}>{f.title}</Title>
                  <Text style={{ color: 'rgba(255,255,255,0.55)' }}>{f.desc}</Text>
                </Card>
              </Col>
            ))}
          </Row>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        background: 'linear-gradient(135deg, #1677ff 0%, #0050b3 100%)',
        padding: '60px 24px', textAlign: 'center',
      }}>
        <Title level={2} style={{ color: '#fff', marginBottom: 8 }}>准备好了吗？</Title>
        <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, marginBottom: 32 }}>
          一个邀请码，开启你的公会智能管理之旅
        </Paragraph>
        <Button size="large" ghost
          style={{ height: 48, padding: '0 32px', fontSize: 16, borderRadius: 8, color: '#fff', borderColor: '#fff' }}
          onClick={() => navigate('/join')}>
          立即创建公会
        </Button>
      </div>

      {/* Footer */}
      <div style={{
        background: '#060a12', padding: '32px 24px',
        textAlign: 'center',
      }}>
        <Space direction="vertical" size={4}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
            22BN公会助手 &copy; {new Date().getFullYear()}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
              style={{ color: 'rgba(255,255,255,0.25)' }}>
              粤ICP备2026037673号-1
            </a>
          </Text>
        </Space>
      </div>
    </div>
  );
}

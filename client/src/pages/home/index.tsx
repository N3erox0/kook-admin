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

const bannerImages = [
  'https://i0.hdslb.com/bfs/archive/7e27fe15757f13e5da1467a76c959ab8.png',
  'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Fpic1.zhimg.com%2Fv2-dcc6a904e6534185ab6ff0baaa33a330_r.jpg',
  'https://i0.hdslb.com/bfs/article/4903fdb71829e8260ba27f215e3496994a9361ff.jpg',
  'https://pic3.zhimg.com/v2-1680251563489819_r.jpg',
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
      {/* Hero - 使用第一张图做背景 */}
      <div style={{
        position: 'relative',
        padding: '100px 24px 120px',
        textAlign: 'center',
        overflow: 'hidden',
        minHeight: 500,
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `url(${bannerImages[0]})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'brightness(0.35)',
        }} />
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: 'linear-gradient(180deg, rgba(10,15,26,0.3) 0%, rgba(10,15,26,0.85) 100%)',
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
          <Title style={{ color: '#fff', fontSize: 44, marginBottom: 8, fontWeight: 700 }}>
            KOOK 公会助手
          </Title>
          <Paragraph style={{ color: 'rgba(255,255,255,0.8)', fontSize: 20, marginBottom: 12 }}>
            专为游戏公会打造的一站式管理系统
          </Paragraph>
          <Paragraph style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, marginBottom: 40, maxWidth: 500, margin: '0 auto 40px' }}>
            库存管理 · 补装审批 · 智能预警 · 成员追踪
          </Paragraph>
          <Space size={16} wrap style={{ justifyContent: 'center' }}>
            <Button type="primary" size="large" icon={<LoginOutlined />}
              style={{ height: 50, padding: '0 36px', fontSize: 16, borderRadius: 10 }}
              onClick={() => navigate('/login')}>
              公会管理员登录
            </Button>
            <Button size="large" icon={<KeyOutlined />}
              style={{ height: 50, padding: '0 36px', fontSize: 16, borderRadius: 10, background: '#faad14', borderColor: '#faad14', color: '#fff' }}
              onClick={() => navigate('/join')}>
              邀请码创建公会
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
        <Space size={16}>
          <Button size="large" ghost
            style={{ height: 48, padding: '0 32px', fontSize: 16, borderRadius: 8, color: '#fff', borderColor: '#fff' }}
            onClick={() => navigate('/join')}>
            立即创建公会
          </Button>
        </Space>
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

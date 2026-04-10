# KOOK 装备管理后台 V4

基于 NestJS + React + Ant Design 的 KOOK 公会装备管理系统。

## 功能模块

- **控制台** — 数据统计、新增/离开成员列表
- **成员管理** — KOOK 成员同步、角色分配
- **装备参考库** — CSV 导入、图片管理、全局通用配置
- **装备库存** — Excel 导入、OCR 识别入库、变动日志
- **补装管理** — 击杀详情识别、去重、审批流转、库存扣减
- **预警系统** — 库存预警 + 死亡次数预警、KOOK 卡片推送
- **邀请码系统** — 一码一公会、状态管理
- **日志系统** — 操作日志 + 消息推送记录

## 技术栈

| 层级 | 技术 |
|:---|:---|
| 前端 | React 18 + TypeScript + Ant Design 5 + Vite |
| 后端 | NestJS + TypeORM + MySQL |
| 缓存 | Redis |
| 部署 | PM2 + Nginx |

## 快速开始

### 1. 环境变量

```bash
cp server/.env.example server/.env
# 编辑 .env 填入实际数据库、Redis、JWT、KOOK 等配置
```

### 2. 安装依赖

```bash
cd server && npm install
cd ../client && npm install
```

### 3. 数据库初始化

按顺序执行迁移脚本：

```bash
mysql -u root -p kook_admin < server/src/database/migrations/001_init_tables.sql
mysql -u root -p kook_admin < server/src/database/migrations/003_v3_multi_guild.sql
mysql -u root -p kook_admin < server/src/database/migrations/004_v4_phase1.sql
mysql -u root -p kook_admin < server/src/database/seeds/003_v3_seed_data.sql
mysql -u root -p kook_admin < server/src/database/seeds/005_v4_phase1_seed.sql
```

### 4. 启动开发

```bash
# 后端
cd server && npm run start:dev

# 前端
cd client && npm run dev
```

### 5. 生产部署

```bash
cd server && npm run build && pm2 start ecosystem.config.js
cd client && npm run build
```

## 安全须知

- `.env` 文件包含敏感配置，**绝不提交到 Git**
- 部署后请**立即修改默认管理员密码**
- KOOK Bot Token、JWT Secret 等密钥请妥善保管
- 生产环境请使用强密码并定期轮换

## 目录结构

```
├── client/               # React 前端
│   ├── src/
│   │   ├── api/          # API 请求层
│   │   ├── components/   # 通用组件（Layout、AuthRoute）
│   │   ├── pages/        # 页面组件
│   │   ├── stores/       # Zustand 状态管理
│   │   └── types/        # TypeScript 类型定义
│   └── vite.config.ts
├── server/               # NestJS 后端
│   ├── src/
│   │   ├── common/       # 守卫、装饰器、工具
│   │   ├── config/       # 配置模块
│   │   ├── database/     # 迁移脚本、种子数据
│   │   └── modules/      # 业务模块
│   ├── .env.example      # 环境变量模板
│   └── ecosystem.config.js
└── README.md
```

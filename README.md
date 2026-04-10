# KOOK 装备管理后台

基于 NestJS + React + Ant Design 的 KOOK 公会装备管理系统。

## 功能模块

- **控制台** — 数据统计、新增/离开成员列表
- **成员管理** — KOOK 成员同步、角色分配
- **装备库存** — Excel 导入、OCR 识别入库、变动日志
- **补装管理** — 击杀详情识别、去重、审批流转、库存扣减
- **预警系统** — 库存预警 + 死亡次数预警、KOOK 卡片推送
- **日志系统** — 操作日志 + 消息推送记录

## 技术栈

| 层级 | 技术 |
|:---|:---|
| 前端 | React 18 + TypeScript + Ant Design 5 + Vite |
| 后端 | NestJS + TypeORM + MySQL |
| 缓存 | Redis |
| 部署 | PM2 + Nginx |

## 目录结构

```
├── client/               # React 前端
│   ├── src/
│   │   ├── api/          # API 请求层
│   │   ├── components/   # 通用组件
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
│   └── ecosystem.config.js
└── README.md
```

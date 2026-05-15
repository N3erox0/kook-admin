# KOOK 公会管理系统 — 技术架构文档（现状版）

> 版本：V2.12.3（2026-05-14）
> 用途：项目交接 / 描述当前线上代码实际架构

---

## 一、整体技术栈

| 层级 | 技术 | 版本/说明 |
|------|------|---------|
| 前端 | React + TypeScript + Vite | React 18 / Vite |
| 前端 UI | Ant Design 5 | — |
| 前端状态 | Zustand | `auth.store` 等 |
| 前端 HTTP | axios | 拦截器 + 401 自动续期 + 请求队列 |
| 后端 | NestJS + TypeORM | `synchronize: false` |
| 数据库 | MySQL 8 | 字符集 utf8mb4 |
| 缓存 | Redis | KOOK 临时 session / OAuth state |
| 图像处理 | sharp + perceptual-hash | pHash 8×8 → 64bit |
| OCR | 腾讯云通用印刷体 OCR | region ap-guangzhou，带 ItemPolygon 坐标 |
| 进程管理 | PM2 | `kook-admin-server` |
| 反向代理 | Nginx + Certbot | HTTPS 443 |
| 测试 | Playwright | `server/scripts/e2e-test.ts` |
| 部署 | git pull + 自建 deploy.sh | 服务器 `/opt/kook-admin` |

---

## 二、目录结构

```
20260411115149/                            # 项目根
├── client/                                # 前端
│   └── src/
│       ├── api/                           # API 请求层
│       │   └── request.ts                 # axios + 401 续期 + noAuthPaths
│       ├── components/
│       │   ├── Layout.tsx                 # 侧边栏 + 用户菜单
│       │   └── GuildRoute.tsx             # 路由守卫
│       ├── pages/
│       │   ├── login/                     # 登录页（KOOK + 账密）
│       │   ├── auth/KookCallback.tsx      # KOOK 纯登录回调
│       │   ├── join/                      # 邀请码创建公会
│       │   ├── guild/                     # 公会选择/创建
│       │   ├── dashboard/                 # 控制台
│       │   ├── member/                    # 成员管理（双 Tab）
│       │   ├── catalog/                   # 装备参考库（SSVIP）
│       │   ├── equipment/                 # 装备库存（含网格识别 Modal）
│       │   ├── resupply/                  # 补装管理
│       │   │   ├── PendingRecognitionTab.tsx   # 待识别 Tab
│       │   │   └── components/MatchPreview.tsx # 图像识别预览
│       │   ├── alert/                     # 预警设置
│       │   ├── invite-codes/              # 邀请码管理
│       │   ├── log/                       # 操作日志
│       │   └── settings/GuildSettings.tsx # 公会设置
│       ├── stores/                        # Zustand
│       └── types/index.ts                 # 全局类型
├── server/                                # 后端
│   └── src/
│       ├── common/                        # 守卫、装饰器、拦截器、工具
│       │   ├── guards/
│       │   │   ├── jwt-auth.guard.ts
│       │   │   ├── guild.guard.ts
│       │   │   └── guild-role.guard.ts
│       │   └── interceptors/transform.interceptor.ts
│       ├── config/                        # 配置（database/jwt/...）
│       ├── database/
│       │   ├── migrations/                # SQL 迁移 001~029
│       │   └── seeds/                     # 测试种子数据
│       └── modules/                       # 业务模块（见下）
├── _sql_upload/                           # 临时上传 SQL
├── nginx/kook-admin.conf                  # Nginx 模板（HTTPS）
├── deploy.sh                              # 部署脚本
├── README.md
├── HANDOVER.md                            # 交接文档
├── TASK_STATUS.md                         # 任务追踪
├── PROJECT_REQUIREMENTS.md                # 本次新增 - 需求现状
├── PROJECT_ARCHITECTURE.md                # 本次新增 - 架构现状（本文件）
└── VERSION_HISTORY.md                     # 本次新增 - 版本历史
```

---

## 三、后端模块清单（16 个）

| 模块 | 路径 | 核心职责 |
|------|------|---------|
| auth | `modules/auth/` | 登录 / JWT / KOOK OAuth / refresh / BOT 邀请链接 |
| user | `modules/user/` | 用户 CRUD / 子账号 / globalRole |
| guild | `modules/guild/` | 公会 CRUD / 激活 / 邀请码 / 设置 / 子账号 |
| member | `modules/member/` | 公会成员 / KOOK 同步 / Albion 公会成员同步 / 手动绑定 |
| equipment-catalog | `modules/equipment-catalog/` | 装备参考库（全局） / Albion 导入 / pHash 生成 / 别称 / 热门图 |
| equipment | `modules/equipment/` | 装备库存（公会级） / 网格保存 / 库存扣减（悲观锁） |
| resupply | `modules/resupply/` | 补装申请 / 审批 / 待识别 / 图像识别预览 / 战报匹配 |
| ocr | `modules/ocr/` | 腾讯云 OCR / pHash 匹配 / 网格切图 / 文字解析 |
| kook | `modules/kook/` | Webhook 接收 / 消息处理 / KOOK API 调用 / BOT 私信 |
| alert | `modules/alert/` | 预警规则 CRUD / 定时检查 / KOOK 卡片推送 |
| scheduler | `modules/scheduler/` | 定时任务调度（@nestjs/schedule） |
| dashboard | `modules/dashboard/` | 控制台统计 / 24h 窗口 |
| log | `modules/log/` | 操作日志（公会隔离 + SSVIP 跨公会） |
| inventory-log | `modules/inventory-log/` | 库存变动日志 |
| upload | `modules/upload/` | 文件上传 |
| permission | `modules/permission/` | 角色/权限定义 |

---

## 四、数据库表结构

### 4.1 ER 关系图

```
users (1) ──< guild_members (N) >── guilds (1)
  │                                    │
  │ owner_user_id ─────────────────────┘
  │                                    │
  └──< user_roles (N) >── roles        │
                                       │
guilds (1) ──< invite_codes (N) [bound_guild_id]
guilds (1) ──< guild_inventory (N) ──> equipment_catalog (1)
guilds (1) ──< guild_resupply (N) ──< guild_resupply_items (N)
guilds (1) ──< alert_rules (N)
guilds (1) ──< inventory_logs (N)
guilds (1) ──< albion_guild_members (N)  # V2.11 新增
```

### 4.2 核心表（V2.12.3 现状）

#### `users`
| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | — |
| username | varchar(50) UNIQUE | KOOK OAuth 自动用户为 `kook_{id}` |
| password_hash | varchar(255) | bcrypt |
| nickname / avatar / email | — | — |
| kook_user_id | varchar(50) UNIQUE | KOOK 平台 ID（子账号为 `local-{guildId}-{userId}` 占位） |
| global_role | varchar(20) | 仅 `ssvip` |
| status | tinyint | 0=禁用 1=启用 |

#### `guilds`
| 字段 | 说明 |
|---|---|
| id / name UNIQUE | 公会名（从 KOOK 同步） |
| icon_url | KOOK 服务器图标 |
| kook_guild_id UNIQUE / kook_bot_token / kook_verify_token | KOOK 配置 |
| kook_resupply_channel_id / kook_admin_channel_id / kook_listen_channel_ids JSON | 频道配置 |
| kook_admin_role_id | 管理员 KOOK 角色 |
| owner_user_id FK | 公会拥有者 |
| invite_code_id | 使用的邀请码 |
| activation_code UNIQUE | 12 位激活码（BOT 入服生成） |
| resupply_rooms JSON | 补装房间配置（V2.2） |
| albion_guild_id | Albion 官网公会 ID（V2.11） |
| status | 0=待激活 1=已激活 2=禁用 |

#### `guild_members`
| 字段 | 说明 |
|---|---|
| guild_id + kook_user_id | 联合唯一 |
| user_id | 关联 users（可空） |
| nickname / kook_roles JSON | KOOK 服务器昵称 + 角色 |
| role | `super_admin` / `inventory_admin` / `resupply_staff` / `normal` |
| status | `active` / `left` |
| joined_at / left_at / last_synced_at | — |
| join_source | `kook_sync` / `invite_link` / `manual` / `webhook` |

#### `invite_codes`
| 字段 | 说明 |
|---|---|
| code varchar(12) UNIQUE | V2.8.7 改为 12 位 |
| status | `enabled` / `used` / `disabled` / `revoked` |
| used_by_user_id / bound_guild_id / bound_guild_name | 绑定信息 |
| created_by | SSVIP id |

#### `equipment_catalog`（装备参考库 全局）
| 字段 | 说明 |
|---|---|
| name / level / quality / gear_score / category / image_url | 基本属性 |
| albion_id varchar(100) UNIQUE | V2.3 |
| phash varchar(255) | V2.7.1 pHash 64bit |
| aliases varchar(500) | V2.7.2 逗号分隔别称 |
| local_image_path varchar(500) | V2.8.2 本地下载图片路径 |
| popularity tinyint | V2.9.7 装备热度 1~5（每天 03:00 更新） |
| hot_image_path varchar(500) | V2.9.8 热门装备截图（用户上传） |

#### `guild_inventory`（装备库存 公会级）
| 字段 | 说明 |
|---|---|
| guild_id / catalog_id FK | 关联参考库 |
| quantity / location | 数量 + 位置 |
| albion_id / item_quality | V2.11 新增（仅展示，不参与扣减） |

#### `guild_resupply`（补装申请）
| 字段 | 说明 |
|---|---|
| guild_id / applicant_user_id / applicant_nickname | — |
| equipment_ids text | V2.5 重构：JSON 数组 catalogId（一条 = 多装备） |
| quantity | 总件数 |
| apply_type | `re OC` / `死亡补装` / `手动` |
| reason text | 消息原文备注 |
| screenshot_url / screenshot_md5 | 截图 + 去重哈希 |
| kill_date / map_name / game_id / guild_name | V2.3 OCR 字段 |
| resupply_box / resupply_room | V2.2 箱子号 + 房间 |
| dedup_hash varchar(255) | 内容级去重 |
| status | `pending` / `approved` / `dispatched` / `rejected` |
| resupply_time | 实际补装时间 |
| invite_source | 来源 |

#### `guild_resupply_items`（V2.11 新增 战报装备明细）
| 字段 | 说明 |
|---|---|
| resupply_id FK | 关联补装申请 |
| albion_id | T8_SWORD@2 等 |
| equipment_name / level / enchant_level / item_quality | 装备完整信息 |
| quantity / match_status | 数量 + 匹配状态 |

#### `albion_guild_members`（V2.11 新增 Albion 公会成员）
| 字段 | 说明 |
|---|---|
| guild_id / albion_player_id / player_name | — |
| joined_at / left_at / status | 加入/离开（每天 07:00 快照） |
| bound_kook_user_id | 自动按昵称绑定 |

#### 其他重要表

| 表 | 说明 |
|---|---|
| `alert_rules` | 预警规则（type: 01 库存 / 02 死亡次数） |
| `alert_records` | 预警触发记录 |
| `inventory_logs` | 库存变动日志（OCR 入库 / 补装扣减 / 手动） |
| `operation_logs` | 操作日志（含 guild_id，V2.4 隔离） |
| `bot_join_records` | V2.6 BOT 入服记录 |
| `scheduled_tasks` | 定时任务执行记录 |

### 4.3 迁移文件清单

```
001_init_tables.sql              基础表
002_v2_schema_update.sql         V2 schema
003_v3_multi_guild.sql           多公会
004_v4_phase1.sql                Phase1
005_v5_activation.sql            激活机制
009_v2.2_resupply_box.sql        补装箱子+房间
010_v2.3_resupply_ocr_fields.sql 补装 OCR 字段独立
011_v2.3_catalog_albion_id.sql   参考库 albion_id
012_v2.4_operation_logs_guild_id.sql  操作日志公会隔离
013_v2.4_invite_source_resupply_time.sql  邀请来源+补装时间
014_v2.4_apply_type_migration.sql  apply_type 迁移
015_v2.5_resupply_restructure.sql  补装重构 equipment_ids
016_v2.6_bot_join_records.sql    BOT 入服表
019_v2.7.1_catalog_phash.sql     phash 字段
020_v2.7.2_catalog_aliases.sql   aliases 字段
021_v2.8.2_catalog_local_image.sql  本地图片路径
022_v2.8.5_strip_tier_prefix.sql 去等级前缀
023_v2.8.7_invite_code_12char.sql  邀请码 12 位
024_v2.9.0_batch1_placeholder.sql  占位
025_v2.9.7_catalog_popularity.sql  装备热度
026_v2.9.8_hot_image_path.sql    热门装备截图
027_v2.9.8_clean_aliases.sql     aliases 乱码清理
028_v2.11_albion_member_killboard_hot_images.sql  Albion 成员 + 战报 + 热门图
029_v2.12.3_existing_guild_login.sql  已有公会账号直登修复
```

---

## 五、权限与请求链

### 5.1 守卫链

```
HTTP 请求
   ↓
[JwtAuthGuard]
   - 从 Authorization Bearer 解析 userId
   - 查 DB 获取最新 globalRole 写入 req.user
   ↓
[GuildGuard]
   - 从 X-Guild-Id header 或 :guildId 参数取 guildId
   - 查 guild_members 验证（含 left 状态降级为只读）
   - SSVIP 跨公会放行（只读）
   ↓
[GuildRoleGuard]
   - 读 @GuildRoles(...) 装饰器
   - super_admin 自动通过所有角色检查
   ↓
Controller 方法
```

### 5.2 Auth API 端点

| 方法 | 路径 | Guard | 用途 |
|---|---|---|---|
| POST | `/api/auth/login` | 无 | 账密登录 |
| POST | `/api/auth/refresh` | 无 | refresh token 续期 |
| GET | `/api/auth/profile` | JWT | 用户信息 |
| GET | `/api/auth/kook/oauth-url?invite_code&purpose=login\|invite` | 无 | KOOK 授权链接 |
| POST | `/api/auth/kook/callback` | 无 | KOOK OAuth 回调，body `{code, callbackPath?}` |
| GET | `/api/auth/kook/bot-invite-url` | 无 | KOOK BOT 邀请链接（scope=bot） |

### 5.3 前端 noAuthPaths

```ts
[
  '/auth/login',
  '/auth/refresh',
  '/guilds/invite-codes/validate',
  '/guilds/activate/info',
  '/guilds/activate',
  '/auth/kook/oauth-url',
  '/auth/kook/callback',
  '/auth/kook/bot-invite-url'
]
```

> 新增公开接口时必须同步添加此数组，否则会因 localStorage 残留 token 导致 401。

---

## 六、前端路由

| 路径 | 页面 | 权限 |
|---|---|---|
| `/` | 官网首页 | 公开 |
| `/login` | 登录页（账密 + KOOK OAuth） | 公开 |
| `/auth/kook-callback` | KOOK 纯登录回调（V2.9.4） | 公开 |
| `/join` | 邀请码创建公会 | 公开 |
| `/ssvip` | SSVIP 登录 | 公开 |
| `/guild/select` | 公会选择 | 需登录 |
| `/guild/create` | 创建公会 | 需登录 |
| `/admin/dashboard` | 控制台 | 全角色 |
| `/admin/members` | 成员管理 | 非 SSVIP |
| `/admin/catalog` | 装备参考库 | SSVIP |
| `/admin/equipment` | 装备库存 | 非 SSVIP |
| `/admin/resupply` | 补装管理（含待识别 Tab） | super_admin / resupply_staff |
| `/admin/alerts` | 预警设置 | super_admin / inventory_admin |
| `/admin/invite-codes` | 邀请码管理 | SSVIP |
| `/admin/logs` | 操作日志 | super_admin / SSVIP |
| `/admin/settings` | 公会设置 | super_admin |

---

## 七、关键服务详解

### 7.1 OCR 模块（`server/src/modules/ocr/`）

```
ocr/
├── image-match.service.ts     # 核心：pHash 生成/匹配/网格切图（≈2400 行）
├── ocr.service.ts             # 腾讯云 OCR 调用 + processRecognition
├── ocr.controller.ts          # /api/ocr/* 端点
├── parsers/
│   ├── equipment.parser.ts    # 文字 OCR → 装备名/等级/品质/数量
│   └── kill-detail.parser.ts  # 击杀详情元数据解析（时间/地图/玩家/公会）
└── entities/                  # OCR 批次表
```

**关键方法**：

| 方法 | 用途 |
|---|---|
| `recognizeImageWithCoords(buf)` | 腾讯云通用 OCR，返回文字 + ItemPolygon 坐标 |
| `matchFromScreenshot(buf, opts)` | 整图按网格切 → 每子图 pHash 匹配（strict/loose 模式） |
| `matchFromRegion(buf, region, opts)` | 指定区域裁切后匹配（击杀详情用） |
| `previewMatchWithCandidates(...)` | V2.9.3 返回 Top N 候选 + 切图 base64 + 原图坐标 |
| `gridParseForManualInput(buf, layout, cropRegion)` | V2.9.2/V2.12 网格手动入库切图 + 数量 OCR + 品质检测 |
| `gridParseByRegion(buf, cols, rows, outerRect)` | V2.12 中心点定位法，按红框定位每格中心点 |
| `prefillGridCellsByLayeredPhash(sharp, cells)` | V2.11/V2.12 三层 pHash 预填（热门图 → 现有 pHash → 官网图） |
| `extractQuantityFromCorner(buf)` | 右下角数量 OCR |
| `detectQualityFromBorder(buf)` | HSV 色相判定品质 |
| `generatePhashForCatalog()` / `batchGeneratePhash()` | 批量生成参考库 pHash（优先本地图） |
| `downloadAllImages()` | 批量下载 Albion 装备图到 local_image_path |

**pHash 阈值常量**：

```ts
STRICT_HAMMING_THRESHOLD = 19   // 库存 ≥70%
LOOSE_HAMMING_THRESHOLD = 25    // 击杀详情 ≥60%
AMBIGUITY_GAP = 3               // 歧义差距（V2.9.6 改为按名字分组）
```

### 7.2 KOOK 模块（`server/src/modules/kook/`）

| 文件 | 职责 |
|---|---|
| `kook-message.service.ts` | Webhook 消息处理（type=2/9/10 图片 + 纯文字 OC 碎） |
| `kook-sync.service.ts` | KOOK 成员同步（分页 + 角色映射 + Token fallback） |
| `kook-bot.service.ts` | BOT 入服 / 私信 / 关键词路由 |
| `kook-api.service.ts` | KOOK API 封装（频道/角色/消息/表情/私信） |
| `kook-notify.service.ts` | KOOK 卡片消息推送（预警/补装通知） |

**消息处理流程**：

```
KOOK Webhook /api/kook/callback
  → verify_token 校验
  → 解码 zlib + 解密 encrypt_key
  → 路由：
     type=255 + extra.type=self_joined_guild → BOT 入服
     type=255 + joined_guild → 成员加入
     type=255 + exited_guild → 成员离开
     type=2/9/10 + 含图片 → processImageMessage
     type=2/9 + 纯文字 + 含"碎" → OC 碎处理
```

### 7.3 Resupply 模块

| 文件 | 职责 |
|---|---|
| `resupply.service.ts` | CRUD / 审批 / 扣库存 / 待识别 / 战报匹配（V2.11） |
| `resupply.controller.ts` | API 端点（路由顺序：merged/grouped 在 :id 之前） |
| `killboard.service.ts` | V2.11 Albion 官网战报匹配（UTC ±5 分钟 + playerName） |

**审批扣库存**：`deductForDispatch` 悲观锁事务 `SELECT FOR UPDATE`，逐 catalogId 扣 -1，优先匹配 level/quality/gearScore 完全一致的库存。

### 7.4 Equipment 模块

| 方法 | 路径 | 用途 |
|---|---|---|
| `gridParse` | POST `/api/guild/:gid/equipment/grid-parse` | 网格识别切图 |
| `gridSave` | POST `/api/guild/:gid/equipment/grid-save` | 逐条 fuzzy 匹配 catalogId 后 upsert |
| `gridParseByRegion` | POST `/api/guild/:gid/equipment/grid-parse-by-region` | V2.12 红框对齐版本 |
| 普通 CRUD | — | 列表/详情/编辑/删除 |

---

## 八、定时任务一览

| 时间 | 任务 | 模块 |
|---|---|---|
| 00:15 | KOOK 全量成员同步 | scheduler / member |
| 03:00 | 装备热度统计 | scheduler / equipment-catalog |
| 05:00 | 库存预警扫描 | scheduler / alert |
| 06:00 | 死亡次数预警 | scheduler / alert |
| 07:00 | Albion 公会成员同步 | scheduler / member |
| 14:00 | 补装回应表情 | scheduler / resupply |

> 所有定时任务执行结果写入 `scheduled_tasks` 表，前端操作日志页"推送记录" Tab 可查。

---

## 九、部署架构

```
[用户浏览器]
    │ HTTPS
    ↓
[Nginx :443]
    ├── /api/* → http://127.0.0.1:3000 (NestJS)
    └── /     → /opt/kook-admin/client/dist (静态)
    │
    ├── 后端 NestJS (PM2: kook-admin-server)
    │     ├── MySQL :3306
    │     ├── Redis :6379
    │     ├── 腾讯云 OCR (region ap-guangzhou)
    │     └── KOOK Open API
    │
    └── 静态前端 (React build)
```

### 部署命令

```bash
ssh root@175.178.120.171
cd /opt/kook-admin && git pull origin main
# 执行新增 SQL（按 HANDOVER.md 第三节列表）
cd server && npm install && npm run build && pm2 restart kook-admin-server
cd ../client && npm install && npm run build
pm2 save
```

### .env 管理

- `.env` 已在 `.gitignore`（含 `.env.remote` / `.env.bak`）
- 服务器 `.env` 为权威版本，备份位置 `/opt/kook-admin-bak-20260411021332/server/.env`
- 部署命令 **不要** 执行 `cp .env` 覆盖
- 比对差异：`scp root@175.178.120.171:/opt/kook-admin/server/.env ./server/.env.remote`

---

## 十、关键代码位置速查

| 模块 | 后端 | 前端 |
|---|---|---|
| 认证 / OAuth | `modules/auth/` | `pages/login/`、`pages/auth/KookCallback.tsx` |
| 公会 / 邀请码 | `modules/guild/` | `pages/guild/`、`pages/join/`、`pages/invite-codes/` |
| 成员（KOOK + Albion） | `modules/member/` | `pages/member/` |
| 装备参考库 | `modules/equipment-catalog/` | `pages/catalog/` |
| 装备库存 + 网格识别 | `modules/equipment/` | `pages/equipment/` |
| 补装 + 待识别 | `modules/resupply/` | `pages/resupply/`、`PendingRecognitionTab.tsx` |
| 图像识别预览 | `modules/ocr/image-match.service.ts` | `pages/resupply/components/MatchPreview.tsx` |
| OCR / pHash | `modules/ocr/` | — |
| KOOK 集成 | `modules/kook/` | — |
| 预警 | `modules/alert/` | `pages/alert/` |
| 定时任务 | `modules/scheduler/` | — |
| 控制台 | `modules/dashboard/` | `pages/dashboard/` |
| 日志 | `modules/log/`、`modules/inventory-log/` | `pages/log/` |
| 权限 Guard | `common/guards/` | — |
| 路由 / 布局 | — | `App.tsx`、`components/Layout.tsx` |
| 全局类型 | — | `types/index.ts` |
| API 请求 | — | `api/request.ts` |
| E2E 测试 | `scripts/e2e-test.ts` | — |

---

## 十一、注意事项与陷阱

1. **NestJS Controller 路由顺序**：静态路由必须在动态路由之前（如 `/merged` 必须在 `/:id` 之前），否则会被 `:id` 拦截。
2. **前端 noAuthPaths**：新增公开接口必须同步添加，否则 localStorage 残留旧 token 会导致 401。
3. **TypeORM synchronize**：已关闭，新增字段必须写 SQL 迁移。
4. **OCR 竞态条件**：V2.6.1 已修复 `createBatch` 改为 await 同步等待识别完成。
5. **OAuth 回调地址三条不可混淆**：登录用 `/auth/kook-callback`、邀请用 `/join`、Webhook 用 `/api/kook/callback`。
6. **EquipmentModule / OcrModule 循环依赖**：使用双向 `forwardRef` 解决。
7. **生产环境必填**：`JWT_SECRET` / `JWT_REFRESH_SECRET` / 腾讯云 OCR Key / KOOK Bot Token / KOOK Verify Token。
8. **PSC 公会硬编码**：V2.11.1 已移除，改从 `guilds.albion_guild_id` 读取。
9. **手动子账号 kook_user_id**：使用本地占位 `local-{guildId}-{userId}`，避免唯一索引冲突。

---

## 十二、版本检查命令

```bash
# 当前 git
git log -1 --oneline                    # commit hash
cat HANDOVER.md | head -10              # 文档版本

# 服务器
pm2 list                                # kook-admin-server 状态
pm2 logs kook-admin-server --lines 50
mysql -u root kook_admin -e "SHOW TABLES;"
```

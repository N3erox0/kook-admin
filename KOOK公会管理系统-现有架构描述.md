# KOOK 公会管理系统 - 现有架构描述文档

---

## 1. 数据库表结构与数据关联关系

### 1.1 核心表 ER 关系

```
users (1) ──< guild_members (N) >── guilds (1)
  │                                    │
  │ owner_user_id ─────────────────────┘
  │
  └──< user_roles (N) >── roles (1) ──< role_permissions (N) >── permissions (1)

guilds (1) ──< invite_codes (N)   [通过 bound_guild_id 关联]
```

### 1.2 `users` 表（用户表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | int | PK, 自增 | 用户ID |
| username | varchar(50) | UNIQUE | 登录账号（KOOK OAuth 自动创建时为 `kook_{kook_user_id}`） |
| password_hash | varchar(255) | - | bcrypt 加密的密码哈希 |
| nickname | varchar(50) | nullable | 昵称 |
| avatar | varchar(255) | nullable | 头像URL |
| email | varchar(100) | nullable | 邮箱 |
| kook_user_id | varchar(50) | UNIQUE, nullable | KOOK 平台用户ID（OAuth2 绑定） |
| global_role | varchar(20) | nullable | 全局角色，仅 `ssvip` 一种 |
| status | tinyint | default 1 | 0=禁用, 1=启用 |
| last_login_at | datetime | nullable | 最后登录时间 |
| created_at / updated_at | datetime | 自动 | 时间戳 |

### 1.3 `guilds` 表（公会表 = SaaS 租户）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | int | PK, 自增 | 公会ID |
| name | varchar(20) | UNIQUE | 公会名称（从 KOOK API 同步） |
| icon_url | varchar(500) | nullable | 公会图标URL（从 KOOK API 同步） |
| kook_guild_id | varchar(50) | UNIQUE | 对应的 KOOK 服务器ID |
| kook_bot_token | varchar(255) | nullable | 该公会的 Bot Token |
| kook_verify_token | varchar(100) | nullable | Webhook 验证 Token |
| kook_webhook_enabled | tinyint | default 0 | 是否启用 Webhook |
| kook_resupply_channel_id | varchar(50) | nullable | 补装监听频道ID |
| kook_admin_channel_id | varchar(50) | nullable | 管理员通知频道ID |
| kook_listen_channel_ids | json | nullable | 监听频道ID列表 |
| kook_admin_role_id | varchar(50) | nullable | 管理员 KOOK 角色ID |
| kook_last_message_id | varchar(100) | nullable | 消息拉取游标 |
| owner_user_id | int | nullable, FK→users | 公会拥有者/创建人（激活后填入） |
| invite_code_id | int | nullable | 创建时使用的邀请码ID |
| activation_code | varchar(64) | UNIQUE, nullable | 一次性激活码（Bot 入驻时生成） |
| invited_by_kook_user_id | varchar(50) | nullable | 邀请机器人入驻的 KOOK 用户ID |
| status | tinyint | default 0 | **0=待激活, 1=已激活, 2=已禁用** |
| created_at / updated_at | datetime | 自动 | 时间戳 |

### 1.4 `guild_members` 表（公会成员表 = 用户与公会的 N:N 中间表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | int | PK, 自增 | 成员记录ID |
| guild_id | int | 联合唯一(guild_id + kook_user_id) | 所属公会 |
| user_id | int | nullable | 关联 users 表（有系统账号时填入） |
| kook_user_id | varchar(50) | 联合唯一 | KOOK 用户ID |
| nickname | varchar(100) | nullable | KOOK 服务器昵称 |
| kook_roles | json | nullable | KOOK 服务器角色列表 |
| role | varchar(20) | default 'normal' | **系统管理角色**（见角色列表） |
| status | varchar(10) | default 'active' | `active`=在会, `left`=已离开 |
| joined_at | datetime | nullable | 加入时间 |
| left_at | datetime | nullable | 离开时间 |
| last_synced_at | datetime | nullable | 最后同步时间 |
| join_source | varchar(20) | default 'kook_sync' | 加入方式：`kook_sync` / `invite_link` / `manual` / `webhook` |
| created_at / updated_at | datetime | 自动 | 时间戳 |

**关键关联**：`guild_members` 是 `users` ↔ `guilds` 的多对多中间表，同时也是权限上下文的来源。

### 1.5 `invite_codes` 表（邀请码表）

| 列名 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | int | PK, 自增 | 邀请码ID |
| code | varchar(32) | UNIQUE | 邀请码字符串 |
| status | varchar(10) | default 'disabled' | `enabled`=启用 / `used`=已使用 / `disabled`=未启用 / `revoked`=作废 |
| used_by_user_id | int | nullable | 使用人用户ID |
| bound_guild_id | int | nullable | 绑定的公会ID |
| bound_guild_name | varchar(100) | nullable | 绑定的公会名称（冗余） |
| used_at | datetime | nullable | 使用时间 |
| created_by | int | nullable | 创建人ID（SSVIP） |
| remark | varchar(200) | nullable | 备注 |

### 1.6 权限相关表

| 表名 | 字段 | 说明 |
|------|------|------|
| `roles` | id, name(唯一), display_name, description | 角色定义表 |
| `permissions` | id, module, action, display_name, description | 权限定义表 |
| `role_permissions` | id, role_id→roles, permission_id→permissions | 角色-权限关联表 |
| `user_roles` | id, user_id→users, role_id→roles | 用户-角色关联表 |

---

## 2. KOOK 机器人功能

### 2.1 Webhook 事件处理（实时推送）

系统通过 `POST /api/kook/webhook` 端点接收 KOOK 平台推送的事件：

| 事件类型 | KOOK 事件名 | 系统行为 |
|---------|------------|---------|
| **Bot 入驻新服务器** | `self_joined_guild` (type=255) | 自动在 guilds 表创建 `pending_activation` 记录 → 生成 12 位激活码 → 私信邀请人发送激活链接 |
| **成员加入服务器** | `joined_guild` (type=255) | 自动在 guild_members 表创建 `active` 记录（join_source=webhook）；若成员曾离开则恢复为 active |
| **成员离开服务器** | `exited_guild` (type=255) | 自动将 guild_members 中对应记录标记为 `left` |
| **频道图片消息** | type=2/9 (普通消息) | 提取图片 → OCR 识别 → 判断是否击杀详情 → 创建补装申请（含去重） |

### 2.2 定时任务

| 时间 | 任务 | 说明 |
|------|------|------|
| 每天 00:15 | 全量成员同步 | 调用 KOOK API 获取所有公会成员，快照比对检测加入/离开 |
| 每天 05:00 | 库存预警扫描 | 按规则检查库存数量，触发 KOOK 卡片消息推送 |
| 每天 06:00 | 死亡次数预警 | 统计补装记录按成员+日期，超阈值推送 KOOK 卡片 |
| 每天 14:00 | 补装回应表情 | 给已通过的补装申请原始 KOOK 消息添加 ✅ 表情 |

### 2.3 KOOK API 调用能力

- 获取服务器详情（名称、图标）：`guild/view`
- 获取成员列表（自动翻页）：`guild/user-list`
- 获取频道列表：`channel/list`
- 获取角色列表：`guild-role/list`
- 发送频道消息/KMarkdown：`message/create`
- 发送私信：`user-chat/create` + `direct-message/create`
- 添加/删除表情回应：`message/add-reaction` / `message/delete-reaction`

---

## 3. 邀请码 → 创建公会注册流程

### 3.1 流程A：Bot 入驻自动触发（推荐）

```
用户邀请Bot进入KOOK服务器
        ↓
KOOK触发 self_joined_guild 事件
        ↓
系统自动创建 guilds 记录 (status=0 待激活)
系统生成 12位 activation_code
        ↓
Bot 私信邀请人：激活链接 + 激活码
        ↓
用户点击链接 → /join?code=XXXX
        ↓
前端自动填入激活码 → 验证通过
        ↓
   ┌── 未登录 ──────────────────────────┐
   │ 选择登录方式：                      │
   │  A) KOOK OAuth2 登录（推荐）       │
   │  B) 账号密码登录                    │
   └────────────────────────────────────┘
        ↓ (已登录/登录完成)
输入 KOOK 服务器 ID → 获取服务器信息（图标+名称）
        ↓
选择补装监听频道
        ↓
点击「确认创建并绑定」
        ↓ (原子性事务)
① guilds.status → 1(active), owner_user_id → 当前用户
② invite_codes.status → 'used'
③ guild_members 创建超级管理员记录
④ 异步触发成员同步 (sync-members)
        ↓
跳转控制台
```

### 3.2 流程B：SSVIP 手动生成邀请码

```
SSVIP 登录 → 邀请码管理页
        ↓
批量生成邀请码（前缀+uuid8位，默认disabled）
        ↓
手动启用指定邀请码 → status='enabled'
        ↓
用户获取邀请码 → /join?code=XXXX 或 /guild/create
        ↓
验证邀请码 → KOOK配置 → 选择频道 → 创建公会
```

### 3.3 激活码 vs 邀请码

| 维度 | 激活码 (activation_code) | 邀请码 (invite_codes) |
|------|------------------------|---------------------|
| 生成方式 | Bot入驻时自动生成 | SSVIP后台手动批量生成 |
| 存储位置 | guilds.activation_code | invite_codes 独立表 |
| 一次性 | 是（绑定公会后失效） | 是（使用后标记used） |
| 验证端点 | `GET /api/guilds/activate/info` | `POST /api/guilds/invite-codes/validate` |

---

## 4. 角色及权限体系

### 4.1 角色列表

| 角色标识 | 中文名 | 作用域 | 生成方式 | 权限范围 |
|---------|--------|--------|---------|---------|
| `ssvip` | SSVIP 超管 | **全局**（users.global_role） | 数据库手动设置 | 查看所有公会（只读）、管理邀请码、系统超管控制台 |
| `super_admin` | 公会超级管理员 | **公会级**（guild_members.role） | 创建公会时自动绑定 | 公会内全部权限（成员管理、角色分配、删除公会、设置） |
| `inventory_admin` | 库存管理员 | 公会级 | 超管在成员管理页手动分配 | 装备库存CRUD、预警设置、OCR识别入库 |
| `resupply_staff` | 补装管理员 | 公会级 | 超管在成员管理页手动分配 | 补装审批、查看库存、查看成员 |
| `normal` | 普通成员 | 公会级 | KOOK同步/Webhook自动创建 | 仅查看（所有操作按钮隐藏） |

### 4.2 菜单可见性

| 菜单项 | super_admin | ssvip | inventory_admin | resupply_staff | normal |
|--------|:-----------:|:-----:|:---------------:|:--------------:|:------:|
| 控制台 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 成员管理 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 装备参考库 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 装备库存 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 补装管理 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 预警设置 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 邀请码管理 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 操作日志 | ✅ | ❌ | ❌ | ❌ | ❌ |
| 公会设置 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 4.3 登录方式

| 方式 | 端点 | 说明 |
|------|------|------|
| **KOOK OAuth2**（推荐） | `GET /api/auth/kook/oauth-url` → KOOK授权页 → `POST /api/auth/kook/callback` | 自动获取 KOOK 身份 → 查找或自动创建系统用户(username=`kook_{id}`) → 签发 JWT |
| **账号密码** | `POST /api/auth/login` | 传统用户名密码登录，bcrypt 验证 → 签发 JWT |
| **Token 刷新** | `POST /api/auth/refresh` | 用 refreshToken 换新的双 Token |

### 4.4 权限守卫链

```
请求 → JwtAuthGuard (验证JWT) → GuildGuard (验证公会成员身份/SSVIP) → GuildRoleGuard (验证角色权限)
```

- **JwtAuthGuard**：从 Bearer Token 解析 userId，查 DB 获取最新 globalRole
- **GuildGuard**：从 `X-Guild-Id` header 或 URL `:guildId` 获取公会ID → 查 guild_members 验证是否为成员 → SSVIP 放行只读
- **GuildRoleGuard**：检查 `@GuildRoles(...)` 装饰器要求的角色列表 → super_admin 自动放行所有

---

## 5. 一个用户创建多个公会的流程

### 5.1 前置条件

用户已有账号（通过任一方式登录过），且至少管理一个公会。

### 5.2 流程步骤

```
① 用户在后台侧边栏点击头像 → 下拉菜单「+ 添加新公会」
        ↓
② 跳转到 /guild/create 页面（已登录，无需重新登录）
   页面顶部显示：当前账号: {nickname}（无需重新登录）
        ↓
③ 步骤1：输入新的邀请码 → 验证通过
        ↓
④ 步骤2：输入新的 KOOK 服务器 ID → 获取服务器信息
   (显示服务器图标 + 名称)
        ↓
⑤ 步骤3：选择补装监听频道 → 点击「确认创建并绑定」
        ↓
⑥ 后端处理（与首次创建相同）：
   - 验证邀请码 (enabled)
   - 检查 KOOK 服务器 ID 未被绑定
   - 创建 guilds 记录 (status=1)
   - 标记邀请码 used
   - 在 guild_members 创建该用户的 super_admin 记录
        ↓
⑦ 异步触发 sync-members 同步新公会的成员数据
   前端显示「正在初始化数据，自动同步频道和成员信息...」
        ↓
⑧ 同步完成后，自动切换到新公会的控制台
```

### 5.3 数据模型视角

```
users (id=1, username='张三')
  │
  ├── guild_members (guild_id=1, role='super_admin')  ←→ guilds (id=1, name='公会A')
  │
  └── guild_members (guild_id=2, role='super_admin')  ←→ guilds (id=2, name='公会B')
```

- 一个 `users` 行可以通过 `guild_members` 关联到 **多个** `guilds`
- 每个关联记录独立维护 `role`（同一用户在不同公会可以有不同角色）
- 登录时返回 `guilds[]` 数组，前端通过 `GuildSelect` 页面切换
- 切换公会 = 修改 `localStorage.currentGuildId` + `X-Guild-Id` header

### 5.4 公会间数据隔离

所有业务查询（库存、补装、预警、日志等）均通过 `WHERE guild_id = ?` 强制隔离：

- **GuildGuard** 在每个请求中验证用户属于目标公会
- 所有 Controller 路由格式：`/api/guild/:guildId/...`
- 所有 Service 方法第一个参数均为 `guildId`

---

**文档版本**：V2.0（基于代码实际实现生成）
**生成时间**：2026-04-11

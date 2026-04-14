# BOT 机器人自动化交互功能 — 需求分析 & 开发建议

> 基于 KOOK API 文档和现有项目代码分析
> 项目目录：c:/Users/Administrator/CodeBuddy/20260411115149

---

## 需求 1：Bot 被拉入服务器后，记录服务器ID和邀请人信息

### KOOK API 分析

**触发事件**：`self_joined_guild`（系统事件，type=255）

```json
{
  "s": 0,
  "d": {
    "channel_type": "GROUP",
    "type": 255,
    "extra": {
      "type": "self_joined_guild",
      "body": {
        "guild_id": "xxx"
      }
    }
  }
}
```

### ⚠️ 关键限制：无法直接获取邀请人 ID

KOOK 的 `self_joined_guild` 事件 **只包含 `guild_id`，不包含邀请人信息**。这与 Discord 不同（Discord 的 `GUILD_MEMBER_ADD` 包含 `inviter` 字段）。

### 开发建议：间接获取邀请人

| 方案 | 实现方式 | 可行性 |
|:---|:---|:---:|
| **方案 A（推荐）** | 收到 `self_joined_guild` 后，调 `GET /api/v3/guild/view` 获取 `user_id`（服务器主），将服务器主视为邀请人 | ✅ 可行 |
| **方案 B** | 收到事件后，调 `GET /api/v3/invite/list` 查询最近的邀请记录，匹配时间最近的邀请创建者 | ⚠️ 不可靠（需 Bot 有邀请管理权限，且邀请记录可能不存在） |
| **方案 C** | 引导用户通过特定链接添加 Bot（链接带 `state` 参数），`self_joined_guild` 的 body 中可能包含 `state` | ⚠️ 需测试确认 |

### 推荐实现（方案 A）

```
事件 self_joined_guild
  ↓
获取 guild_id
  ↓
调 GET /api/v3/guild/view?guild_id=xxx
  → 获取 name, icon, user_id(服务器主)
  ↓
调 GET /api/v3/user/view?user_id=服务器主ID&guild_id=xxx
  → 获取 username, nickname, identify_num
  ↓
写入 bot_join_records 表
```

### 新建库表：`bot_join_records`

```sql
CREATE TABLE bot_join_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(50) NOT NULL COMMENT 'KOOK服务器ID',
  guild_name VARCHAR(100) COMMENT '服务器名称',
  guild_icon VARCHAR(500) COMMENT '服务器图标',
  inviter_kook_id VARCHAR(50) COMMENT '邀请人KOOK ID（服务器主）',
  inviter_username VARCHAR(100) COMMENT '邀请人用户名',
  inviter_identify_num VARCHAR(10) COMMENT '邀请人识别号',
  status ENUM('pending', 'activated', 'left') DEFAULT 'pending' COMMENT '状态',
  invite_code_id INT COMMENT '关联的邀请码ID（激活后填入）',
  guild_member_count INT COMMENT '服务器成员数',
  joined_at DATETIME NOT NULL COMMENT 'Bot加入时间',
  activated_at DATETIME COMMENT '激活时间（创建公会时）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_guild_id (guild_id)
) COMMENT='Bot加入服务器记录';
```

### 需要修改的代码文件

| 文件 | 改动 |
|:---|:---|
| `kook-message.service.ts` | `handleWebhookEvent()` 中新增 `self_joined_guild` 事件处理分支 |
| `kook.service.ts` | 已有 `getGuildView()` 和 `getUserView()`，可直接复用 |
| `kook.module.ts` | 注入新的 `BotJoinRecord` 实体 |
| 新建 `entities/bot-join-record.entity.ts` | TypeORM 实体 |

---

## 需求 2：Bot 加入服务器后，私信邀请人一条带邀请码的官网链接

### KOOK API 接口

**发送私信**：`POST /api/v3/direct-message/create`（项目中已封装为 `kookService.sendDirectMessage()`）

### 实现流程

```
self_joined_guild 事件触发
  ↓
获取服务器信息 + 服务器主ID
  ↓
生成/分配一个邀请码（从邀请码池中取一个 enabled 状态的）
  ↓
调 sendDirectMessage(服务器主ID, 消息内容)
```

### 私信内容模板（KMarkdown，type=9）

```
**🎉 感谢邀请我加入 [{服务器名称}]！**

我是 KOOK 公会管理助手，可以帮助您管理装备库存、补装申请和成员信息。

**立即开通管理后台：**
[👉 点击这里开始配置](http://22bngm.online/guild/create?code={邀请码})

您的专属邀请码：`{邀请码}`

如有疑问，请发送 `/帮助` 查看使用说明。
```

### 开发建议

- 私信使用 **type=9（KMarkdown）** 格式，支持加粗、链接、代码块
- 邀请码自动分配逻辑：从 `invite_codes` 表中取一个 `status=enabled` 的，绑定到 `bot_join_records`
- 如果邀请码池为空，私信提示"当前暂无可用邀请码，请联系系统管理员"
- 可选：用 **卡片消息（type=10）** 做更美观的展示

### 现有代码可复用

```typescript
// kook.service.ts 已有
await this.kookService.sendDirectMessage(inviterKookId, message, 9); // type=9 = KMarkdown
```

---

## 需求 3：用户添加 Bot 为好友，自动发送宣导链接

### KOOK API 分析

### ⚠️ 关键限制：KOOK 没有"好友请求"Webhook 事件

KOOK 的事件文档中**不包含好友申请/添加事件**。完整事件列表中与好友相关的只有 HTTP API（`/api/v3/friend/*`），没有 Webhook 推送。

| 能力 | 是否支持 |
|:---|:---:|
| Webhook 推送好友申请事件 | ❌ 不支持 |
| Webhook 推送好友添加成功事件 | ❌ 不支持 |
| HTTP API 获取好友列表 | ✅ `GET /api/v3/friend` |
| HTTP API 处理好友申请 | ✅ `POST /api/v3/friend/handle-request` |

### 替代方案

| 方案 | 实现方式 | 可行性 |
|:---|:---|:---:|
| **方案 A（推荐）** | 用户发送私信给 Bot 时触发（`channel_type=PERSON` 的消息事件），首次收到私信时自动回复宣导链接 | ✅ 可行 |
| **方案 B** | 定时轮询好友列表 `GET /api/v3/friend`，对比新增好友发送消息 | ⚠️ 效率低，有频率限制 |
| **方案 C** | 在 Bot 个人简介中放官网链接，不主动推送 | ✅ 最简单 |

### 推荐实现（方案 A）

Webhook 能收到私信消息（`channel_type=PERSON`），当用户给 Bot 发第一条私信时，自动回复宣导消息。

```
用户给 Bot 发送任意私信
  ↓
Webhook 收到 channel_type=PERSON 的消息
  ↓
检查该用户是否已回复过（Redis/DB 记录）
  ↓
首次 → 发送宣导链接
已回复过 → 进入关键词处理逻辑
```

### 宣导消息模板

```
**👋 你好！我是 KOOK 公会管理助手**

我可以帮助你的公会管理装备库存、补装申请和成员数据。

**🌐 访问官网了解更多：**
[http://22bngm.online](http://22bngm.online)

**🚀 快速开始：**
1. 将我邀请到你的 KOOK 服务器
2. 在服务器中发送 `/试用`
3. 使用收到的邀请码注册管理后台

如需帮助，发送 `/帮助` 查看全部指令。
```

### 需要修改的代码

| 文件 | 改动 |
|:---|:---|
| `kook-message.service.ts` | 在 `handleWebhookEvent()` 中增加 `channel_type === 'PERSON'` 的处理分支 |
| 新建 Redis key 或 DB 表 | 记录已发送宣导的用户ID，避免重复发送 |

---

## 需求 4：Bot 关键词触发 — 用户发送"邀请码"则提示邀请 Bot 到服务器

### KOOK API 分析

**触发方式**：用户在私信中发送包含"邀请码"关键词的消息

**接收方式**：Webhook 收到 `channel_type=PERSON`、`type=1`（文本消息）

### 实现逻辑

```
Webhook 收到私信消息（channel_type=PERSON）
  ↓
提取消息内容 content
  ↓
关键词匹配：
  ├ 包含"邀请码" → 回复提示（见下文）
  ├ 包含"/帮助" → 回复帮助信息
  ├ 包含"/试用" → 回复"请先邀请我到服务器"
  └ 其他 → 首次发宣导，否则忽略或通用回复
```

### 回复模板（关键词"邀请码"）

```
**📋 关于邀请码**

邀请码用于开通公会管理后台，获取方式：

1️⃣ **先将我邀请到你的 KOOK 服务器**
   [👉 点击邀请机器人](https://www.kookapp.cn/app/oauth2/authorize?id=44930&permissions=...) 

2️⃣ **邀请成功后，我会自动私信你一个邀请码**

3️⃣ **使用邀请码前往官网注册**
   [http://22bngm.online/guild/create](http://22bngm.online/guild/create)

如已邀请机器人但未收到邀请码，请发送 `/试用` 重新获取。
```

### 需要修改的代码

| 文件 | 改动 |
|:---|:---|
| `kook-message.service.ts` | 新增私信关键词路由方法 `handlePrivateMessage()` |

---

## 综合开发建议

### 1. 代码结构建议

```
server/src/modules/kook/
├── kook-message.service.ts    ← 修改：新增 self_joined_guild 处理 + 私信路由
├── kook-bot-interaction.service.ts  ← 新建：Bot 自动化交互（私信回复、关键词）
├── kook.service.ts            ← 无需改动（已有 sendDirectMessage 等方法）
├── entities/
│   └── bot-join-record.entity.ts  ← 新建：Bot 加入记录实体
└── interfaces/
    └── kook-api.interface.ts  ← 无需改动
```

### 2. Webhook 事件处理流程（修改后）

```
handleWebhookEvent(payload)
  ├── challenge 验证
  ├── verify_token 校验
  │
  ├── type=255 系统事件：
  │   ├── extra.type = "self_joined_guild"  → 需求1+2：记录+私信邀请码
  │   ├── extra.type = "self_exited_guild"  → Bot被踢出，更新记录状态
  │   └── 其他系统事件 → 忽略
  │
  ├── channel_type = "PERSON"（私信）：
  │   ├── 首次私信 → 需求3：发送宣导链接
  │   ├── 关键词"邀请码" → 需求4：提示邀请Bot
  │   ├── 关键词"/试用" → 引导邀请Bot
  │   ├── 关键词"/帮助" → 返回帮助信息
  │   └── 其他 → 通用回复或忽略
  │
  └── channel_type = "GROUP"（频道消息）：
      └── 现有逻辑（补装识别等）
```

### 3. 数据库变更

| 变更 | SQL |
|:---|:---|
| 新建 `bot_join_records` 表 | 见需求1中的建表语句 |
| 可选：新建 `bot_interaction_log` 表 | 记录 Bot 与用户的交互（私信/关键词），用于统计 |

### 4. 注意事项

| 项目 | 说明 |
|:---|:---|
| **邀请人获取** | KOOK 不直接提供邀请人，用服务器主（owner）替代，或引导用户发 `/试用` 自报 |
| **好友事件** | KOOK 无好友添加 Webhook 事件，用"首次私信"替代 |
| **防刷** | 私信回复需做频率限制（同一用户 1 小时内只回复 1 次宣导） |
| **邀请码池** | 需确保有足够的 enabled 邀请码可供自动分配 |
| **Bot 邀请链接** | 需在 KOOK 开发者平台生成 Bot 邀请链接，包含必要权限 |

### 5. Bot 邀请链接生成

当前项目的 Bot 邀请链接（需要在开发者平台确认权限）：

```
https://www.kookapp.cn/app/oauth2/authorize?id=44930&permissions=0&bot_id=0&scope=bot
```

> 注意：`permissions` 值需包含所需权限位（查看频道+发送消息+管理消息+查看成员）

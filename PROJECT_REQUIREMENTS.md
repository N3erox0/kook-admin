# KOOK 公会管理系统 — 完整需求文档（现状版）

> 版本：V2.12.3（2026-05-14）
> 用途：项目交接 / 仅描述当前线上实际功能，不含未实现项

---

## 一、项目定位

**KOOK 公会装备管理 SaaS 后台**：面向 Albion Online 公会，基于 KOOK 群（KOOK 即开黑啦）实现公会成员管理、装备库存管理、补装审批、死亡战报识别、预警推送等闭环。

- **运行环境**：NestJS + React + Ant Design + MySQL + Redis + Nginx
- **多租户**：一公会一租户，公会间数据物理隔离（`WHERE guild_id = ?`）
- **域名**：`22bngm.online`（已配置 HTTPS）
- **关联数据源**：Albion Online 官方 API（`gameinfo.albiononline.com`）

---

## 二、角色与权限

### 2.1 角色定义

| 角色 | 作用域 | 来源 | 主要权限 |
|------|------|------|---------|
| **SSVIP** | 全局 (`users.global_role`) | DB 手动设置 | 跨公会只读 + 邀请码管理 + 装备参考库 + 系统超管控制台 |
| **super_admin** | 公会级 | 创建公会自动绑定 | 公会内全权限（成员、角色、设置、删除公会） |
| **inventory_admin** | 公会级 | super_admin 手动分配 | 装备库存 CRUD + 预警设置 + OCR 入库 |
| **resupply_staff** | 公会级 | super_admin 手动分配 | 补装审批 + 查看库存/成员 |
| **normal** | 公会级 | KOOK 同步自动创建 | 只读（按钮全隐藏） |

### 2.2 菜单可见性

| 菜单 | super_admin | ssvip | inventory_admin | resupply_staff | normal |
|------|:-:|:-:|:-:|:-:|:-:|
| 控制台 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 成员管理 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 装备参考库 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 装备库存 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 补装管理 | ✅ | ❌ | ❌ | ✅ | ❌ |
| 预警设置 | ✅ | ❌ | ✅ | ❌ | ❌ |
| 邀请码管理 | ❌ | ✅ | ❌ | ❌ | ❌ |
| 操作日志 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 公会设置 | ✅ | ❌ | ❌ | ❌ | ❌ |

### 2.3 守卫链

```
JwtAuthGuard (验JWT) → GuildGuard (验公会成员/SSVIP) → GuildRoleGuard (验角色)
```

---

## 三、登录与注册体系

### 3.1 登录方式（三种）

| 方式 | 入口 | 流程 |
|------|------|------|
| **账号密码** | `/login` | `POST /auth/login` → 返回 JWT + guilds[] → 自动选首个公会进 dashboard |
| **KOOK OAuth 登录** | `/login` "KOOK 登录" 按钮 | `getKookOAuthUrl(purpose='login')` → KOOK 授权页 → `/auth/kook-callback` → 直跳 dashboard |
| **Token 刷新** | 自动 | 401 自动调 `/auth/refresh` 续期，请求队列等待 |

### 3.2 创建公会流程（两条路径）

**路径 A（推荐）：BOT 入服自动触发**

```
邀请 BOT 进 KOOK 服务器
  → KOOK 推送 self_joined_guild
  → 系统创建 pending 公会 + 生成 12 位激活码
  → BOT 私信服主：激活链接
  → 用户点击 /join?code=XXX
  → KOOK OAuth (purpose=invite) → 选服务器/选频道 → 完成
```

**路径 B：SSVIP 后台手动发邀请码**

```
SSVIP 在邀请码管理页批量生成 → 启用指定邀请码
  → 用户在 /join 输入邀请码 → 验证 → KOOK OAuth → 选频道 → 完成
```

### 3.3 多公会切换

- 用户头像下拉菜单 "+ 添加新公会" → `/guild/create`
- 一个 user 可通过 `guild_members` 关联多个 guilds
- 切换公会 = 改 `localStorage.currentGuildId` + 请求头 `X-Guild-Id`

### 3.4 手动子账号

- super_admin 在公会设置页一键创建
- 自动生成 `username = {公会缩写}{2字母}{4数字}` + 8 位密码
- `kook_user_id` 使用本地占位 `local-{guildId}-{userId}`，不绑定真实 KOOK

---

## 四、功能模块

### 4.1 控制台（Dashboard）

- 卡片：成员总数 / 装备总数 / 待处理补装（点击各卡片跳转对应页面）
- 新增/离开成员列表：基于最近 24 小时窗口
- 显示上次 KOOK 成员同步时间
- SSVIP 视图：公会列表 Table + 展开成员/库存/补装

### 4.2 成员管理（双 Tab）

**Tab 1：公会成员（Albion 来源，V2.11 新增）**
- 每天 07:00 同步 Albion 官网公会成员快照（加入/离开自动比对）
- 按 PlayerName 自动绑定 KOOK 成员
- 字段：PlayerName / KOOK 昵称 / 加入时间 / 在公会天数 / 状态
- 支持手动绑定 KOOK 成员

**Tab 2：KOOK 成员**
- 每天 00:15 全量同步 KOOK 服务器成员
- 字段：昵称 / KOOK 角色（下拉过滤） / 系统角色 / 状态 / 加入时间 / 最后同步时间
- 支持搜索（昵称 + KOOK 角色 + 系统状态组合 + 查询按钮）
- 支持反选"无 KOOK 角色"成员
- 系统角色折叠进眼睛图标，仅 super_admin 可改

### 4.3 装备参考库（SSVIP 全局）

- 字段：装备名称 / 等级(1~8) / 品质(0~4) / 装等(P+数字) / 部位 / 图标 / albion_id / aliases / phash / local_image_path / hot_image_path / popularity(1~5)
- 支持 CSV 批量导入（新格式：别称, 等级, 品质, 装等, 数量, 位置）
- 一键从 Albion API 批量导入装备
- 批量下载 Albion 装备图片到本地（pHash 用）
- **新增热门装备**：搜索已有装备 → 上传游戏内截图 → 设置 popularity → 自动归档为 hot_image_path
- 别称（aliases）：逗号分隔，用于补装文字消息识别（如"堕神,堕神杖"）
- 装备热度：每天 03:00 统计 inventory_logs 扣减次数自动更新

### 4.4 装备库存（公会级）

- 字段：装备名（catalogId 关联参考库）+ 等级 + 品质 + 装等 + 部位 + 数量 + 位置 + 时间
- 支持：分页 50/100 切换、按部位/等级/品质筛选、数量行内编辑、批量修改位置、查看变动日志
- **三种入库方式**：
  1. **网格识别入库**（主按钮，V2.12 重写） — 详见第五章
  2. **Excel/CSV 导入** — 支持别称三档匹配（精确/别称/模糊）
  3. **手动新增** — 搜索参考库（最少 2 字符触发，限 20 条，支持 P 格式/数字前缀/别称）
- 删除：super_admin Popconfirm 确认

### 4.5 补装管理（含待识别 Tab）

**Tab 1：补装列表**
- 字段：申请人 / 装备列表（多 catalogId 展开） / 数量 / 类型(re OC/死亡补装/手动) / 原因 / 状态 / 时间 / 击杀日期 / 地图 / 公会名
- 支持：日期范围搜索、装等+装备名组合搜索、合并视图（按用户+截图+日期聚合）
- 详情页：960px Modal，左 380px 截图预览 + 右字段信息 + 操作按钮
- 详情页支持：图像识别预览（原图红框+Top5 候选+勾选确认→quickComplete 直接扣库存）
- 待补装备区域：可放大查看 / 编辑（搜索装备增删改数量）
- 房间分配：批量分配房间编号（自动从昵称正则提取箱子号）
- 装备显示格式：`P{装等} {装备名}`，按武器→副手→头→甲→鞋排序

**Tab 2：待识别工作区**
- 来源：KOOK 自动识别失败（pHash 全失败 / OC 碎无匹配词）
- 操作：批量废弃 / 单条修正（手填装备）→ quickComplete 直接 DISPATCHED

**补装审批**：通过后逐 catalogId 扣库存 -1（悲观锁事务 `SELECT FOR UPDATE`）

**去重**：
- 截图：MD5(截图URL | 日期 | KOOK用户ID)
- 击杀详情：额外加装备名 + 序号
- 内容级：MD5(时间+地点+人+装备IDs 排序)

### 4.6 预警系统

| 类型 | 触发时间 | 规则 |
|------|---------|------|
| **01 库存预警** | 每天 05:00 | 按装等+装备名合并数量 < 阈值 → KOOK 卡片消息 |
| **02 死亡次数预警** | 每天 06:00 | 按成员+日期统计补装记录 > 阈值 → KOOK 卡片消息 |

- 预警规则页：CRUD + 启用/禁用 + 记录查看 + 解决标记
- KOOK 卡片消息汇总多条触发

### 4.7 操作日志

- 公会隔离：`/api/guild/:guildId/logs`
- SSVIP 走 `/api/admin/logs`（跨公会）
- 字段：操作人 / 模块 / 动作（中文映射） / 状态（成功/失败） / 时间（不显示 IP）
- 推送记录 Tab：scheduled_tasks 执行记录（任务名/时间/结果/耗时）

### 4.8 公会设置

- **基础配置**：通知频道下拉（从已获取频道列表选）/ 管理员角色下拉（KOOK API 拉取）
- **监听频道**：多选（kook_listen_channel_ids JSON），显示已监听 Tag 列表 + 最后配置时间
- **公会图标**：可手动刷新 / super_admin 可上传头像
- **补装房间配置**：guilds.resupply_rooms JSON
- **子账号管理**：一键创建账密
- Bot Token / Verify Token 由后台 `.env` 全局配置，前端不可见

### 4.9 邀请码管理（SSVIP）

- 字段：code(12 位) / status(enabled/used/disabled/revoked) / bound_guild_name / used_at / created_by / remark
- 批量生成 / 启用 / 作废
- BOT 入服自动生成的邀请码默认 `enabled`
- 激活时自动联动：邀请码标记 `used` + 写入绑定信息

### 4.10 KOOK 集成

**Webhook 实时事件**：

| 事件 | 处理 |
|------|------|
| self_joined_guild | 创建 pending 公会 + 12 位激活码 + 私信服主 |
| joined_guild | guild_members 加 active 记录（join_source=webhook），曾离开者恢复 |
| exited_guild | guild_members 标记 left（super_admin 跳过） |
| message (type=2/9/10) | 提取图片 → OCR → 击杀详情判定 → 补装申请 |

**定时任务**：

| 时间 | 任务 |
|------|------|
| 00:15 | KOOK 全量成员同步 |
| 03:00 | 装备热度统计 |
| 05:00 | 库存预警扫描 |
| 06:00 | 死亡次数预警 |
| 07:00 | Albion 公会成员同步 |
| 14:00 | 补装回应表情（已通过申请 → 原 KOOK 消息加 ✅） |

**KOOK API 能力**：guild/view、guild/user-list（自动翻页 V2.9.9 修复 50 限制）、channel/list、guild-role/list、message/create、user-chat/create、message/add-reaction

**OAuth 回调地址（三条）**：

| 用途 | 地址 |
|------|------|
| Webhook 消息推送 | `http://22bngm.online/api/kook/callback` |
| OAuth 纯登录 | `http://22bngm.online/auth/kook-callback` |
| OAuth 创建公会 | `http://22bngm.online/join` |

### 4.11 BOT 交互（私信）

| 触发 | 行为 |
|------|------|
| BOT 入服 | 私信服主：激活链接 + 12 位邀请码 |
| 用户首次私信 | 自动回复官网宣导 |
| 私信"邀请码" | 返回当前可用邀请码（如有） |
| 私信"帮助" | 返回功能列表 |
| 私信"试用" | 返回试用引导 |

---

## 五、OCR / 图片识别体系（核心）

### 5.1 三条识别管线

| # | 入口 | 用途 | 当前算法 |
|---|------|------|---------|
| **A** | 装备库存页"网格识别入库" | 手动批量入库 | 网格切图 + pHash 分层匹配 + 数量 OCR + 品质边框检测 |
| **B** | KOOK 频道图片消息（自动） | 死亡补装申请 | **V2.11 改为文字 OCR + Albion 官网战报匹配**（暂停 pHash） |
| **C** | KOOK 频道纯文字消息（自动） | OC 碎/领地碎补装 | "碎"字关键词 + 后段装备词解析 + 别称匹配参考库 |

### 5.2 网格识别（管线 A，详见版本更新记录专章）

**当前实现（V2.12.1）**：

- **6 种容器布局**（Radio 单选）：
  - 公会岛箱子 5×7 / 军队木箱 5×7
  - 蛋箱 5×2
  - 背包大 4×5 / 背包中 5×7 / 背包小 6×8
- **多图批量上传**：一次选多张，逐张识别累加 gridCells，同名装备去重提示
- **前端红框对齐**：上传后显示三框标线（外框+格子蓝框），用户拖拽缩放对齐
- **后端切图**：中心点定位法，按 outerRect 均匀定位每格中心，向外扩展 88% 步长（自动排除间隙）
- **分层 pHash 预填**：热门图库 → 现有 pHash → 官网图片库 顺序匹配，confidence ≥ 0.55 自动填 aliasName
- **数量识别**：右下角圆圈区域调 OCR（先 stddev > 25 前置过滤）
- **品质识别**：HSV 色相检测边框（灰 Q0/绿 Q1/蓝 Q2/紫 Q3/金 Q4）
- **空格丢弃**：stddev < 18 不返回
- **手动调整**：缩放比 InputNumber（10%~500% 步长 5%）、AutoComplete 别名搜索、套用↓批量、只显示未填筛选
- **保存**：逐条 findByNameFuzzy(0.7) 匹配 catalogId → upsert 叠加入库

### 5.3 死亡补装（管线 B，V2.11 重做）

**触发**：KOOK 频道图片消息含"击杀详情" / "擊殺詳細資訊"关键词

**当前流程**：
1. OCR 提取文字（带坐标 ItemPolygon）
2. 关键词判定是否击杀详情，不是直接 return
3. 从文字 OCR 提取：日期 / 地图 / 左侧玩家昵称 / 公会名
4. **按 UTC ±5 分钟匹配 Albion 官网死亡战报**（killboard API）
5. 战报装备明细写入 `guild_resupply_items`（albionId / 装备名 / 等级 / 附魔 / item_quality / 数量 / 匹配状态）
6. **暂停了 pHash 装备图标识别**（之前的算法保留代码但不启用）
7. 消息原文存入 `reason` 字段
8. 全失败也创建 pending 记录（空装备，管理员手动补）

**去重**：MD5(时间+地点+人+装备IDs 排序)，多张图相同内容跳过

**阈值**：pHash 击杀详情阈值 LOOSE=25（≥60%），入库阈值降至 0.55（V2.9.9.1）

### 5.4 OC 碎 / 含"碎"字文字（管线 C）

**触发**：KOOK 频道纯文字消息含"碎"字（覆盖 OC 碎/mass 碎/领地碎）

**流程**：
1. 以第一个"碎"字为分界，后段文字作为装备描述区
2. 拆词过滤纯数字（如 "62挣脱鞋" → "挣脱鞋"+T6Q2）
3. 别称（aliases）+ 装备名双字段模糊匹配（findByNameFuzzy 0.7）
4. 有未匹配 → 整条进待识别工作区
5. applyType = 're OC'，reason 保留消息原文

### 5.5 pHash 匹配阈值

| 场景 | 阈值（汉明距离） | 相似度 |
|------|---------|--------|
| 装备库存 OCR（STRICT） | ≤ 19 | ≥ 70% |
| 击杀详情（LOOSE） | ≤ 25 | ≥ 60% |
| 装备库存入库门槛 | confidence ≥ 0.55 | 自动预填 |
| KOOK 自动补装门槛 | confidence ≥ 0.70 | 否则进待识别 |
| 歧义差距（V2.9.6） | — | 按装备名分组，同名不同品质不算歧义 |

---

## 六、数据隔离与安全

- **多租户隔离**：所有业务 Service 第一参数 = guildId，Controller 路由格式 `/api/guild/:guildId/...`
- **JWT**：access + refresh 双 token，401 自动续期 + 请求队列
- **TypeORM**：`synchronize: false`，schema 强制走 SQL 迁移
- **`.env`**：仅服务器存在权威版本，不上传 GitHub，`.gitignore` 已配置
- **前端 noAuthPaths**：公开接口白名单（`/auth/login` / `/auth/refresh` / `/guilds/invite-codes/validate` 等），新增公开接口必须同步加入
- **HTTPS**：Nginx + Certbot，模板在 `nginx/kook-admin.conf`
- **生产校验**：JWT_SECRET 启动时强制校验，缺失直接退出

---

## 七、当前状态（V2.12.3）

- 最新 commit：`6eebe3b`
- 数据库迁移：001~029 全部执行
- PM2 进程：`kook-admin-server`（入口 `dist/src/main.js`）
- 仓库：https://github.com/N3erox0/kook-admin
- 服务器：`/opt/kook-admin`，IP `175.178.120.171`

---

## 八、未实现 / 后续待办

| 项 | 状态 |
|---|------|
| 公会图标侧边栏显示 | 已部分实现（V2.12 头像上传） |
| OCR 库存 vs 补装分两套流水线 | 已通过 strict/loose 区分 |
| 装备库存 OCR 数量识别（圆圈内） | 已实现（V2.9.2 extractQuantityFromCorner） |
| 库存 Excel(.xlsx) 原生导入 | **未做**（仅 CSV） |
| kook_message_time 字段 | **未做** |
| Albion 装备数据定时同步 | **未做**（仅手动触发） |
| 补装回应表情失败重试 | **未做** |
| pHash 死亡补装重启用 | **暂停状态**（V2.11 改用官网战报） |

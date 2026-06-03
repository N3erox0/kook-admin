# KOOK 公会管理系统 — 版本更新记录

> 截止版本：V3.3.0（2026-06-03）
> 仓库：https://github.com/N3erox0/kook-admin
> 最新 commit：待推送

---

# V3.3.0 — KOOK 监听补装识别从 OCR 切换为文本关键词（2026-06-03）

## 背景

V3.2 之前死亡补装依赖腾讯云通用印刷体 OCR（GeneralBasicOCR）识别截图中的"击杀详情"标题及玩家昵称、UTC 时间等元数据。生产实测出现 **`ResourceUnavailable.ResourcePackageRunOut`（账号资源包耗尽）** 错误，全部 OCR 调用返回空 `TextDetections`，导致：
- 监听频道 469 张/天死亡截图全部被判定为"非击杀详情"跳过
- 错误被静默吞掉（`callTencentOcrRaw` 不读 `Response.Error`），PM2 日志看不出真正原因

V3.3.0 砍掉 OCR 图片识别，改为成员发送**结构化关键词文本**触发补装识别（图片只作为附件挂在 reason 上）。

## 一、新关键词规则

### 1.1 死亡补装
```
击杀详情【05/31/2026 14:41】(UTC时间)游戏名【yesbabe】备注【金风】
```
- 触发词：`击杀详情`
- 时间块（按 UTC 解析，支持 4 种格式）：
  - `MM/DD/YYYY HH:mm[:ss]`
  - `YYYY-MM-DD HH:mm[:ss]`
  - `YYYY/MM/DD HH:mm[:ss]`
  - `M月D日 HH:mm[:ss]`（年默认当年）
- 游戏名：`游戏名【...】`
- 备注：`备注【...】`（可选）

### 1.2 OC 碎补装
```
OC碎【P8堕神奶杖、P8皇家鞋、P8冰箱头、平8石棺盾】游戏名【yesbabe】备注【金风】
```
- 触发词：`OC碎`
- 装备清单：`OC碎【...】` 内（分隔符 `、` `，` `,` 空格），抓不到则回退到 V2.x 的"碎"字后拆词兜底
- 游戏名/备注同上

## 二、流程变更

| 旧（V3.2 OCR） | 新（V3.3 关键词） |
|---|---|
| 图片 → 腾讯云OCR文字+坐标 → 判断"击杀详情" → Albion实时API匹配 | 文本 → 关键词正则 → 4 格式UTC时间解析 → `matchByPlayerAndTime` 本地战报匹配（±2h） |
| 元数据从 OCR 文字坐标推算 | 元数据直接从【】槽位提取 |
| `processImageMessage` 主路径 | `processDeathKeywordMessage` 主路径，OCR 分支保留注释回退用 |
| 失败原因看不到 | 三种失败明确进待识别工作区 |

## 三、变更详情（F-347~F-352）

### F-347 新增 `v3-text-parser.ts` 纯函数解析器
- 文件：`server/src/modules/kook/parsers/v3-text-parser.ts`（新增 ~290 行）
- 导出：`parseV3Message` / `parseUtcTime` / `isDeathKeyword` / `isOcBrokenKeyword` / `splitEquipmentList` / `buildReason`
- 中英文【】(全角/半角) 都统一处理
- 4 种 UTC 时间格式白名单
- 纯函数无 NestJS 依赖，便于将来加单元测试

### F-348 `kook-message.service.ts` 入口分发改造
- 文件：`server/src/modules/kook/kook-message.service.ts`
- 实时消息（`handleWebhookEvent`）+ 历史消息（`pullHistoryMessages`）同一套关键词分发逻辑
- 优先级：`击杀详情` → `processDeathKeywordMessage` > `OC碎` → `processOcBrokenMessage` > 旧关键词（碎/死了）兜底
- 多图消息：图片 URL 用逗号拼接存入 `screenshot_url` 作为附件
- 旧 `processImageMessage` 调用全部注释保留，便于灰度回退

### F-349 新增 `processDeathKeywordMessage`
- 步骤：解析 → 去重(MD5) → 时间块缺失/玩家名缺失/本地战报未命中 → 进待识别；战报命中→抽 7 部位→全命中创建 pending 补装；任一未命中参考库 → 进待识别
- 复用现有 `albionKillboardService.matchByPlayerAndTime` 和 `resupplyService.createFromKillDetail`，零新数据库结构

### F-350 `processOcBrokenMessage` 增强
- 新增可选 `screenshotUrls` 参数（同条消息附带的图片 URL）
- 优先抓 `OC碎【...】` 内清单（V3.3 新规则）
- 抓不到回退到"碎"字后拆词（V2.x 旧规则兜底）
- reason 字段：`游戏名:xxx | 备注:xxx | 残余原文`，800 字截断

### F-351 OCR 错误日志增强（hotfix 顺手做）
- 文件：`server/src/modules/ocr/ocr.service.ts`
- 新增 `logTencentOcrError` 统一日志方法
- 三处调用点（`recognizeImageWithCoords` / `callTencentOcr` / `callTencentOcrBase64`）调用后都打日志：
  - `Response.Error` 存在 → ERROR 级别（含 Code/Message/RequestId/URL前80字）
  - `TextDetections` 为空 → WARN 级别（含 RequestId）
- 装备库存录入页继续用 OCR，本次问题（资源包耗尽）会立即在 PM2 日志可见

### F-352 sync-members 500 兜底
- 文件：`server/src/modules/dashboard/dashboard.controller.ts`
- 整体外层 try/catch，任何未捕获异常包装为 `{ success: false, message }` 返回 200
- 各分支异常加 `logger.error` 含 stack，方便服务器侧定位

### F-353 公会创建流程移除"管理员角色 ID"提示
- 文件：`client/src/pages/join/index.tsx`
- 删除"3. 右键管理员角色 → 复制 ID（可选，用于 @通知）"提示行
- 该字段保留在公会设置页（`GuildSettings.tsx`）由超管后配置

### F-354 CSV 简化格式前缀自动解析 + 匹配失败列表
- 文件：`client/src/pages/equipment/index.tsx`
- 新增 `parseEquipNamePrefix` 工具函数，支持 6 种前缀格式：
  - `80长弓` → name=长弓, level=8, quality=0, gearScore=8（两位数字 = LQ）
  - `44堕神法杖` → name=堕神法杖, level=4, quality=4, gearScore=8
  - `P9重锤` → name=重锤, level=8, quality=1, gearScore=9（装等推 LQ）
  - `平7长弓` → name=长弓, level=7, quality=0（平=Q0）
  - `T6Q2长弓` → name=长弓, level=6, quality=2
  - `长弓` → 原名透传 + L0Q0（兜底）
- 之前 simple 格式强制 level=0/quality=0，导致后端 batchMatch 必失败
- Modal 顶部增加"总条数/已匹配/未匹配/未导入"统计 Tag
- 新增"原文"列展示 CSV 原始装备名
- 导入后能匹配上的直接入库，匹配失败的保留在 Modal 内的"匹配失败列表"卡片（红色边框，含原文/解析后L+Q/数量/位置/失败原因），方便用户截图反馈补全参考库

## 四、随车收敛的 V3.2.1 待推送改动

V3.2.1（2026-06-03 早些时候本地完成未推送）一并合并发布：
- F-341 待识别弹窗 7 部位行内搜索
- F-342 战报列表"装备详情"列 + 行展开 10 部位
- F-343 KOOK 触发逻辑：7 部位全命中创建 pending，否则进待识别
- F-344 手动创建补装搜索过滤 7 部位
- F-345 战报装备 catalogId 反查与展示
- F-346 `processImageMessage` 7 部位过滤（V3.3 已注释，但代码保留）

## 五、数据库变更

❌ 无 schema 变更（沿用 `guild_resupply` 现有字段：reason/screenshotUrl/equipmentIds/applyType/killTimeUtc/...）

## 六、运维数据清理（用户手工执行）

### PSC 公会清空补装+库存（重置）
```sql
START TRANSACTION;
SET @gid := (SELECT id FROM guilds WHERE name = 'PSC' LIMIT 1);
DELETE FROM guild_resupply WHERE guild_id = @gid;
DELETE FROM ocr_recognition_batch WHERE guild_id = @gid;
DELETE FROM guild_inventory WHERE guild_id = @gid;
DELETE FROM inventory_log WHERE guild_id = @gid;
COMMIT;
```

### 10087 测试工会及关联数据清理
```sql
START TRANSACTION;
SET @tgid := 10087;
DELETE FROM guild_resupply WHERE guild_id = @tgid;
DELETE FROM ocr_recognition_batch WHERE guild_id = @tgid;
DELETE FROM guild_inventory WHERE guild_id = @tgid;
DELETE FROM inventory_log WHERE guild_id = @tgid;
DELETE FROM battle_reports WHERE guild_id = @tgid;
DELETE FROM albion_guild_members WHERE guild_id = @tgid;
DELETE FROM guild_members WHERE guild_id = @tgid;
DELETE FROM guilds WHERE id = @tgid;
COMMIT;
```

## 七、修改文件统计

- **新增**：1 文件（`v3-text-parser.ts` 290 行）
- **修改**：5 文件
  - `kook-message.service.ts` +280/-25
  - `ocr.service.ts` +55/-5
  - `dashboard.controller.ts` +35/-15
  - `join/index.tsx` -1
  - 文档 3 个

## 八、运行预期

成员在监听频道发：
```
击杀详情【06/03/2026 14:41】(UTC时间)游戏名【yesbabe】备注【金风】
```
PM2 日志看到：
```
[PSC公会] [V3.3.0死亡补装] 玩家=yesbabe, 时间=2026-06-03T14:41:00.000Z (原:06/03/2026 14:41), 备注=金风
[PSC公会] [V3.3.0死亡补装] 创建成功: id=123, yesbabe, 7部位=7件
```
未命中（如玩家拼错）会进待识别工作区，前端"补装管理 → 待识别"Tab 可看到红框装备名 + 截图。

---



# V3.2.1 — 补装系统 7 部位简化（2026-06-03）

## 核心变更
1. **补装系统只处理 7 个部位**：武器/副手/头/甲/鞋/披风/坐骑（药水/食物/背包不再进入补装）
2. **待识别弹窗 7 部位行内搜索**：固定 7 行，每行独立 AutoComplete + 按部位过滤参考库 + 装等显示 + 清空按钮
3. **战报记录列表新增"装备详情"列**：默认前 4 件 Tag + "+N" 提示，点击行展开 10 部位详情（V3.2 展开行原样保留）
4. **KOOK 触发逻辑重构**：战报匹配 → 提取 7 部位装备 → **全命中参考库** → 直接创建 pending 补装；任一未命中或战报匹配失败 → 整条进入"待识别"批次
5. **手动创建补装搜索过滤**：装备搜索 AutoComplete 自动过滤 药水/食物/背包/其他分类

## 变更详情（F-341~346）

### F-341 待识别弹窗 7 部位行内搜索
- 文件：`client/src/pages/resupply/PendingRecognitionTab.tsx`（重写）
- 弹窗左侧：战报截图大图 + 未匹配装备名提示区
- 弹窗右侧：固定 7 行（武器/副手/头/甲/鞋/披风/坐骑），每行：部位 Tag + AutoComplete + 装等列 + 清空按钮
- 自动预填：从战报已匹配的 7 部位装备按 category 映射到对应行
- 部位不一致警告：用户在"头"行选了"长剑"也允许，但显示橙色警告 Tag

### F-342 战报列表"装备详情"列
- 文件：`client/src/pages/battleReport/index.tsx`
- "装备数"列改为"装备详情"列：显示前 4 件装备 Tag + "+N" + "(点击行展开)" 提示
- 行点击展开仍显示 10 部位完整布局（V3.2 实现保留）
- 未匹配装备红色 Tag

### F-343 KOOK 触发逻辑：7 部位过滤 + 全命中判断
- 文件：`server/src/modules/kook/kook-message.service.ts` (`processImageMessage`)
- 新增常量 `SEVEN_CATEGORIES = {武器,副手,头,甲,鞋,披风,坐骑}`
- 战报装备过滤：`equipmentItems = items.filter(it => SEVEN_CATEGORIES.has(it.category))`
- 装备数量改为 1（每件 1 件，不再 flatMap quantity 倍数）
- 新规则 `goPending`：战报未匹配 OR 7 部位装备数=0 OR 任一 catalogId 为空 → 进入待识别
- 进入待识别走 `ocrService.createKookBatch(guildId, imageUrl, kookUserId, kookNickname, lowConfItems)`，跳过 `createFromKillDetail`

### F-344 手动创建补装搜索过滤
- 文件：`client/src/pages/resupply/index.tsx`
- `handleCatalogSearch` / `handleDetailEquipSearch` 两处搜索处理器加 `filter(it => SEVEN_CATEGORIES_SET.has(it.category))`
- 用户搜索时不会出现药水/食物/背包/其他

### F-345 待识别弹窗 OCR 显示区移除
- 砍掉旧的"OCR 原始识别"区块（与 V3.0 后废弃 pHash 路径同步）
- 砍掉"图像识别预览（点击展开）"折叠区（V3.0 后已是死代码）
- 保留：批次号、KOOK 用户ID、申请人昵称（可改）、战报截图大图

### F-346 待识别批次创建支持仅"战报参考装备"
- 已用现有 `OcrService.createKookBatch` API（无需后端改动）
- `lowConfItems` 即"7 部位中战报扫到但未全命中参考库的装备"
- 管理员在弹窗中看到这些装备名作为提示，手动选对应参考库装备

## 数据库变更
**无**（无新增字段、无新表）。

## 文件统计
- 后端修改：1 个（`kook-message.service.ts`）
- 前端修改：3 个（`PendingRecognitionTab.tsx` / `battleReport/index.tsx` / `resupply/index.tsx`）

## 风险提示
- ⚠️ **触发逻辑变化**：以前战报匹配后会创建 pending 补装（即使部分装备未命中），现在只要任一未命中就进"待识别"，**待识别量会上升**，需管理员手动介入
- ⚠️ **数量字段**：补装内每件装备数量固定 1（之前可能根据 `event.Count` 翻倍），如有 2 把同款也只算 1 件 → 与战报实际死亡数据一致

## 待办（V3.3）
- 按部位合并补装单（一个成员多条死亡按部位归一）
- 战报并发拉取（worker pool 3 并发）
- SSVIP 装备参考库专项

---

# V3.2 — 系统简化 + 战报增量拉取改造（2026-06-03）

## 核心目标
1. 进一步简化菜单和成员管理，分离"登录账号"与"公会成员"
2. 修复战报定时任务时区错误，从早 10:00 移回北京 02:00
3. 战报拉取从单页 limit=20 改为增量分页（按本地最大 deathTime 水位线追平）
4. 战报展示按 10 部位分组、未匹配装备红色标识

## 一、菜单与权限重构（F-319~321）
- 公会侧左侧菜单从 10 项精简为 4 项：**控制台 / 成员管理 / 装备库存 / 补装管理**
- 隐藏的 6 项（路由保留）：战报记录 / 库存预警 / 公会设置 / 操作日志 / 装备参考库 / 邀请码管理
- 仪表盘新增"管理入口区"卡片网格，按权限露出：公会设置 / 库存预警 / 战报记录 / 操作日志 / 登录账号

## 二、登录账号独立模块（F-322~325）
- 新增 `accounts` 模块（公会维度），路由 `/api/guild/:guildId/accounts`，仅超管访问
- 列表合并展示当前公会所有账号来源：KOOK 登录 / 邀请码 / KOOK 同步 / 手动创建
- 支持手动创建账号（账密登录，创建即绑公会，不计入"公会成员总数"）
- 支持改角色 / 启停 / 重置密码（仅手动账号）
- 前端新页面 `/admin/accounts`

## 三、成员列表精简（F-326）
- 隐藏 KOOK 成员 Tab，仅显示"公会成员"（Albion）
- KOOK 后端数据保留，绑定弹窗仍可用

## 四、装备库存改造（F-327~330）
- 修复"录入库存"按钮失效（实际是录入区在 Card 内不够显眼），改为按钮下方独立蓝色 Card 显示
- CSV 导入改为弹窗：拖拽/点击 + 模板下载按钮统一在 Modal 内
- **新增"导出 CSV"按钮**：列含 装备名/等级/品质/装等/部位/数量/位置/更新时间
- **导出全选 Switch**：开 = 全量导出；关 = 按当前筛选条件导出（按钮文案动态显示条数）
- 导出 UTF-8 BOM，防 Excel 中文乱码

## 五、战报拉取改造（F-331~336）
- **Cron 时区固定为 `Asia/Shanghai`**（修复 V3.0 实际跑早 10:00 的 BUG）
- **`getPlayerDeathsPaged` 新增**：按 offset/pageSize 分页拉取
- **增量分页核心逻辑**：
  - 取本地该成员最大 deathTime 作为水位线
  - 每页 51 条循环，遇到 `TimeStamp <= 水位线` 立即停止
  - 首次冷启动上限 4 页（约 200 条/人）
- **入库改 INSERT IGNORE**（typeorm `.insert().orIgnore()`）：消除并发场景下 SELECT-then-INSERT 产生的 Duplicate WARN
- **手动触发并发锁**：同公会同时只允许一个拉取任务（进程内 Set 锁）
- **单成员失败重试 1 次**（间隔 2s）
- **单次任务总耗时上限 30 分钟**
- 全部 Cron 任务统一加 `Asia/Shanghai` 时区注解（成员同步 / 库存预警 / 死亡预警 / 装备热度 / KOOK 频道轮询）

## 六、战报展示增强（F-337~340）
- 列表行精简为：成员/死亡时间/死亡地图/击杀公会/装备数/已补装
  - "死亡地图"列动态显示（无数据时整列隐藏）
- **展开行 10 部位分组**：武器/副手/头/甲/鞋/披风/坐骑/药水/食物/背包，缺失部位显示灰色占位
- **单装备紧凑格式**：`{level}.{enchantLevel} {部位} {名称}`，例 `8.3 武器 堕神法杖`
- **未匹配装备红色 Tag** + 鼠标悬停显示完整 albionId
- 战报入库时 `equipment_list` JSON 同时记录 `gearScore`、`category`、`matchStatus`（依赖 `extractEquipmentItems` 现有返回字段）

## 数据库变更
- 仅 `031_v3.2_simplify_and_battle_pull.sql`（幂等校验脚本，不增删字段）
- `users` / `guild_members` / `battle_reports` 表结构均无破坏性变更
- 战报装备扩展字段写入 `equipment_list` JSON 内（不改表结构）

## 文件统计
- 后端新增：3 个（accounts 模块）+ 1 SQL
- 后端修改：4 个（albion-killboard.service / albion.service / albion.controller / scheduler.service / app.module）
- 前端新增：1 页面（accounts）
- 前端修改：5 页面（Layout / dashboard / member / equipment / battleReport / App）

## 待办（V3.3）
- 按部位合并补装单（一个成员多条死亡按部位归一）
- 战报并发拉取（worker pool 3 并发，缩短拉取耗时）
- SSVIP 装备参考库专项：未入库装备聚合统计、一键加入参考库、别称管理优化

---

# V3.1 — 战报展示与拉取稳定性优化（2026-05-30）
- 战报页面列优化 + 装备中文名显示 [F-315~316]
- 战报拉取改异步 + try/catch 单事件级别，避免单事件失败导致整公会回滚 [F-317~318]
- `extractEquipmentItems` 提取失败时降级取 `Victim.Equipment` 原始数据

---

# V3.0.2 — 测试反馈修复（2026-05-22）
- 补装去重逻辑重新启用（修复重复记录根因）[F-314]
- 装备库存录入改行内编辑（替代 Modal 弹窗）[F-313]
- Albion 绑定去掉手动表单仅保留快速绑定 + 修复 roles 端点 500 [F-312]
- 库存按钮并排 + 轮询改 4 次 + Albion 快速绑定弹窗 [F-308~311]

---

# V3.0.1 — 登录页精简（2026-05-19）
- 登录页移除 KOOK 登录按钮，精简布局 [F-307]

---

# V3.0 — 系统精简重构（2026-05-18）

## 核心变更：大幅降低系统使用难度和复杂度

### 砍掉的功能
- **pHash 图片网格识别系统**：`image-match.service.ts` 从 93KB 精简为 2KB 空实现 stub
- **混元 Vision API 调用**：不再使用 AI 视觉识别
- **网格切图入库**：前端移除"网格识别入库"按钮和相关 UI
- **装备库存 OCR 复杂流程**：去掉网格类型选择（5×7/4×5/6×8等）、图片拖拽缩放对齐等

### 新增功能
- **Albion Killboard 战报拉取**（`AlbionKillboardService`）
  - 每天 02:00 自动拉取公会所有成员死亡记录
  - 支持手动一键拉取
  - 存储到 `battle_reports` 表：成员名/时间/地图/击杀者/装备列表/声望
  - 通过 `albionEventId` 唯一索引去重
- **战报记录前端页面**
  - 按成员名/日期范围查询
  - 展示装备列表、匹配状态
- **定时轮询 KOOK 频道消息**
  - 每 10 分钟自动拉取监听频道新消息
  - 替代 Webhook 实时推送的被动模式，降低配置复杂度
- **OC碎关键词扩展**：新增繁体支持（死亡補裝/死了/OC碎等）

### 重构的流程
- **击杀详情图处理**：OCR识别"击杀详情"→提取玩家名+时间+地图→查询战报表获取装备（替代 pHash 图标识别）
- **库存管理**：仅保留表格(CSV)导入 + 手动录入增减，每笔操作记录变动日志

### 数据库变更
- 新增 `battle_reports` 表（迁移文件：`028_v3.0_battle_reports.sql`）
- `guilds` 表新增 `albion_guild_id`、`albion_server` 字段（IF NOT EXISTS）

### 文件统计
- 修改：~15 文件
- 新增：5 文件（entity/service/controller/api/page）
- 净减：~90KB（image-match.service.ts 大幅缩减）

---

# 第一部分：库存装备网格识别 — 算法演进史（专题）

> **这是项目中迭代次数最多、思路变化最大的模块**。从最早的"文字 OCR"完全失败，到当前的"网格切图 + 三层 pHash + 数量 OCR + 品质边框检测 + 红框对齐"组合方案，前后经历约 10 个版本调整。本章按时间顺序梳理算法变化、踩过的坑和最终方案。

## 0.1 时间线总览

| 版本 | 方案核心思路 | 结果 |
|------|------|------|
| ~V2.6 | **文字 OCR**（腾讯云通用印刷体直接识别装备名称） | ❌ 几乎完全失败 — 游戏字体特殊+图标遮挡 |
| V2.7 | 同上，调整搜索/匹配策略（拆词/去前缀） | ❌ 仍失败，宣告纯文字 OCR 在游戏装备图上不可用 |
| V2.7.1 | **方案 B：整图按固定网格切割 + pHash 与参考库比较** | ✅ 可行，但参考库用 Albion 渲染图，相似度低 |
| V2.8.2 | **批量下载 Albion 装备图到本地** + pHash 优先读本地文件 | ✅ 匹配速度提升，但精度仍偏低 |
| V2.8.3 | **多候选 iconSize（5 个候选 0.70~1.30 倍）** + 抹黑四角（等级/数量/星标） + 阈值 19→25 | ⚠️ 精度提升，但同名不同品质装备出现严重歧义 |
| V2.9.1 | **阈值分档 STRICT(19)/LOOSE(25)** + **歧义差距检验**（最佳 vs 次佳 < 3 丢弃） | ⚠️ 歧义检验过于激进，把正确匹配也丢了 |
| V2.9.2 | **方案 D：网格识别入库 — 不要求全自动**，切图后让用户手动填别名 | ✅ 用户体验飞跃，质变 |
| V2.9.5 | **detectGridRegion 增强**：连续高方差行块定位 + 安全裁剪 + estimateIconSize 细粒度估算列数 | ✅ 切图位置更准 |
| V2.9.6 | **pHash 歧义修复**：按装备名分组，同名不同品质（灰/绿/蓝/紫/金）不算歧义 | ✅ 找回大量正确匹配 |
| V2.9.7 | **装备热度 popularity** + 分类匹配按热度排序（热门装备优先） | ✅ 击杀详情精度大幅提升 |
| V2.9.8 | **热门装备截图归档**（用户上传游戏内截图，多 pHash 取最近） | ✅ 同一装备不同品质边框统一识别 |
| V2.9.9 | **击杀详情切图算法重写**：10 格百分比坐标定位（cx/cy）替代等分网格 | ✅ 装备图标对齐精度质变 |
| V2.9.9.1 | 入库阈值从 0.70 降至 **0.55** | ✅ conf=0.63~0.69 的匹配不再被丢弃 |
| V2.10 | **OCR 锚点定位装备区**：找"搜索/等阶/类别"或"720%"锚点 y 坐标精确裁剪；Radio 单选+多图批量上传；pHash 自动预填 | ✅ 锚点定位让切图不再依赖人眼 |
| V2.11 | **三层 pHash 匹配**：热门图库 → 现有 pHash → 官网图片库 顺序预填 | ✅ 当前主方案 |
| V2.12 | **完整重写网格识别**：6 种容器类型 + 固定红框 + 图片拖拽缩放对齐 | ✅ 用户完全可控 |
| V2.12.1 | **中心点定位法**：以 outerRect 均匀定位每格中心点，向外扩展 88% 步长（自动排除间隙） | ✅ 当前线上版本 |

---

## 0.2 详细方案演化

### 阶段 1：纯文字 OCR 时代（V2.6 及之前）— 失败

**思路**：腾讯云通用印刷体 OCR 直接识别游戏装备截图中的装备名称。

**问题**：
1. Albion Online 装备字体特殊（艺术化字体）
2. 装备图标占大部分像素，文字仅在底部/右下角
3. 数量数字 `x99` 和等级罗马数字干扰
4. 装备名前缀混乱（"禅师级"/"专家级"/"老手级"等级前缀）

**结论**：**文字 OCR 在游戏装备图标上完全不可用**，弃用。

---

### 阶段 2：方案 B — 整图网格切割 + pHash（V2.7.1~V2.8.5）

**核心思路**：装备截图是规则的网格（如 5×7），按固定网格切割每个子图，对每个子图计算 pHash，与装备参考库的 pHash 比较（汉明距离）。

**实现**：
```
图片预处理 → 缩放到标准高度 → 按网格切割（icon ~60-80px）
  → 每个子图裁切中心 70%（去品质边框）
  → 生成 pHash 64bit → 与参考库比较（汉明距离 ≤ 19）
```

**遇到的问题与逐步修复**：

| 子版本 | 问题 | 修复方案 |
|---|---|---|
| V2.7.1 | 参考库用 Albion 官方渲染图，与游戏内截图差异大 | 优先使用游戏内截图作为参考（后期 V2.9.8 实现） |
| V2.8.2 | 网络读 Albion 图片慢 | `local_image_path` 批量下载到本地，pHash 优先读本地 |
| V2.8.3 | 不同分辨率/缩放下 iconSize 不固定 | **多候选 iconSize**：遍历 5 个候选尺寸（0.70~1.30 倍），取最多子图组合 |
| V2.8.3 | 等级罗马数字、右下角数量、星标附魔污染 pHash | **maskCorners** 抹黑左上/右上/右下三个角 |
| V2.8.3 | 阈值 19 太严，相似图过不了 | 改 25（相似度 ≥60%） |
| V2.8.5 | 击杀详情顶部 UI（标题/日期）/底部 UI（按钮）干扰 | **detectGridRegion** 基于行方差自动裁掉顶部/底部 UI |

**遗留问题**：
- 同名装备不同品质（如灰品质堕神 vs 金品质堕神）pHash 极相似，造成严重歧义
- 无法区分相似外观的两件装备（如不同 tier 同名）

---

### 阶段 3：自动化的极限（V2.9.1）— 引入歧义检验

**新增**：阈值分档 + 歧义差距检验
- `STRICT_HAMMING_THRESHOLD = 19`（库存 OCR 用，要求 ≥70%）
- `LOOSE_HAMMING_THRESHOLD = 25`（击杀详情用，要求 ≥60%）
- `AMBIGUITY_GAP = 3`：最佳匹配 vs 次佳匹配的汉明距离差 < 3 时，判定为歧义，丢弃不要

**结果**：召回率严重下降。同名同 tier 不同品质的装备（pHash 距离差 1~2）被全部当成歧义丢弃。

---

### 阶段 4：方案 D — 不强求全自动（V2.9.2）— 质变

**思路转变**：库存录入不需要 100% 自动，**切图 + 让用户手动选装备名** 即可，速度和准确度都比纯手动录入快 10 倍。

**实现**：
- `gridParseForManualInput`：按网格切图 → 每格返回 base64 缩略图 + 右下角数量 OCR + 边框色品质检测
- 前端 1200 宽 Modal：缩略图 + AutoComplete 别名搜索 + 等级/品质/数量/位置可编辑 + **套用↓**（当前行批量应用到下方所有未填）+ **只显示未填**筛选
- 后端 `gridSave`：逐条 `findByNameFuzzy(0.7)` 匹配 catalogId → upsert 叠加入库
- **品质边框 HSV 色相检测**：灰 Q0/绿 Q1/蓝 Q2/紫 Q3/金 Q4
- **右下角数量 OCR**：`extractQuantityFromCorner` 截切右下角圆圈区域单独调腾讯云 OCR

**用户反馈**：完美，质变。从此放弃"全自动"幻想，主走"切图 + 辅助预填 + 用户校对"路线。

---

### 阶段 5：切图精度优化（V2.9.5~V2.9.6）

| 子版本 | 优化 |
|---|---|
| V2.9.5 | `detectGridRegion` 增强：安全裁剪 12%+8% UI 区域、**连续高方差行块定位**、`estimateIconSize` 细粒度列数估算 |
| V2.9.6 | **pHash 歧义修复**：按装备名分组，同名不同品质视为同一装备，歧义检验改为不同装备名之间比较（找回大量被错杀的正确匹配） |

---

### 阶段 6：装备热度 + 热门图归档（V2.9.7~V2.9.8）

**思路**：公会内常用装备就那几十件，给它们更高优先级。

**实现**：
- `equipment_catalog.popularity TINYINT`（1~5），每天 03:00 统计 `inventory_logs` 扣减次数自动更新
- 击杀详情匹配时按热度 DESC 排序，热门装备优先
- **热门装备截图归档**：管理员上传多张游戏内截图，同一装备不同品质（灰/绿/蓝/紫/金）边框统一为同一装备
- 每个装备可有多个 pHash，匹配时取距离最小的

**收益**：击杀详情精度大幅提升，特别是常用装备误匹配率显著下降。

---

### 阶段 7：击杀详情百分比定位重写（V2.9.9）

**问题**：等分网格在不同分辨率下偏移严重。

**新方案**：**10 格百分比坐标定位**
```
左面板 3×4 网格固定布局（包/头/披风/主手/甲/副手/药水/鞋/食物/坐骑）
每格中心点用相对面板的百分比坐标(cx%, cy%)定义
缩放因子从面板宽高反推 iconSize
```

**效果**：装备图标对齐精度质变，不再依赖 detectGridRegion 自动检测。

---

### 阶段 8：OCR 锚点 + 多图批量（V2.10）

**思路**：让 OCR 帮我们找装备区，而不是猜。

**实现**：
- **OCR 锚点定位**：先调腾讯云 OCR 找"搜索 / 等阶 / 类别"（箱子类）或"720%"红绿条（背包类）的 y 坐标，精确裁剪装备区
- 底部锚点："估计市价 / 全部移动"
- **Radio 单选** 替代 Select：6 种容器（公会岛箱子 5×7 / 军队木箱 5×7 / 蛋箱 5×2 / 背包大 4×5 / 背包中 5×7 / 背包小 6×8）
- **多图批量上传**：一次选多张，逐张识别累加 gridCells
- 同名装备出现在多张图中提示用户去重
- **pHash 自动预填**：切图后每格 pHash 匹配参考库，confidence ≥ 0.55 自动填 aliasName
- **新增热门装备弹窗重做**：搜索已有参考库装备 + 上传图片 + 热度，去掉装等/别称/描述

---

### 阶段 9：三层 pHash + 战报匹配（V2.11）

**重大转向**：死亡补装放弃 pHash，改用 **Albion 官网战报匹配**。

**死亡补装新流程（管线 B）**：
1. KOOK 收到击杀详情图
2. 文字 OCR 提取：日期 / 地图 / 左侧玩家昵称 / 公会名
3. 按 UTC ±5 分钟匹配 Albion 官网 killboard API
4. 战报装备明细写入 `guild_resupply_items`
5. **暂停 pHash 装备图标识别**（代码保留但不启用）

**库存网格识别（管线 A）三层匹配**：
```
prefillGridCellsByLayeredPhash:
  1. 先尝试 热门图库 (hot_image_path) STRICT 阈值
  2. 失败 → 现有 pHash (phash) LOOSE 阈值
  3. 仍失败 → 官网图片库 (Albion API 拉取候选) STRICT 阈值
```

**库存识别上传区**：保留三框标线校准（外框 + 内部蓝框网格），但更注重用户拖拽对齐。

---

### 阶段 10：红框对齐 + 中心点定位（V2.12 ~ V2.12.1，当前线上版本）

**思路**：与其反复优化自动检测，不如让用户自己拖红框，**所见即所得**。

**实现（V2.12）**：
- 6 种容器布局每种对应一个固定 cols × rows
- 前端显示三框：外框（红色，整个装备区） + 每格蓝框
- 用户**拖拽缩放对齐**红框，匹配实际截图中的装备区
- 上传后前端把 outerRect 坐标传给后端

**算法（V2.12.1）— 中心点定位法**：
```ts
// 以 outerRect 均匀定位每格中心点
const cellW = outerRect.width / cols
const cellH = outerRect.height / rows
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const cx = outerRect.x + (c + 0.5) * cellW
    const cy = outerRect.y + (r + 0.5) * cellH
    // 向外扩展 88% 步长切图（自动排除 6% 间隙）
    const halfW = cellW * 0.88 / 2
    const halfH = cellH * 0.88 / 2
    crop(cx - halfW, cy - halfH, cellW * 0.88, cellH * 0.88)
  }
}
```

**V2.12.1 完整优化清单**：

| 优化 | 说明 |
|------|------|
| 前端蓝框比例缩小 | 蓝框考虑 6% 间隙，比格子缩小 ~88%，更贴合实际图标 |
| 缩放比 InputNumber | 替代文字提示，输入框直接输入（10%~500%，步长 5%） |
| 中心点定位切图重写 | 见上方代码 |
| pHash 改用 centerThumbnail | 优先用中心裁切图（去边框/角标），提高匹配准确率 |
| 数量 OCR + 前置过滤 | 调用 `extractQuantityFromCorner`，增加 `stddev > 25` 前置过滤跳过空格 |
| 品质边框检测 | 调用 `detectQualityFromBorder`，pHash 匹配后保留图片检测的品质 |
| 搜索结果显示修复 | value 改为 c.name（非别称），结果增至 20 条，name 匹配优先排序 |
| cols/rows 防御性检查 | 限制 1~20，防异常参数大循环 |
| 空格直接丢弃 | stddev < 18 不加入 cells，不返回前端 |

---

## 0.3 关键阈值与常量一览（截至 V2.12.3）

```ts
// server/src/modules/ocr/image-match.service.ts
STRICT_HAMMING_THRESHOLD = 19   // 严格 ≥70%（库存 OCR）
LOOSE_HAMMING_THRESHOLD  = 25   // 宽松 ≥60%（击杀详情）
AMBIGUITY_GAP            = 3    // 歧义差距（V2.9.6 改为按名分组）

// 网格切图
中心裁切区域比例 = 88%
空格丢弃 stddev < 18
数量 OCR 前置 stddev > 25

// 自动预填
confidence ≥ 0.55  → 自动填 aliasName（库存）
confidence ≥ 0.70  → KOOK 自动补装（否则进待识别）
```

---

## 0.4 历经的失败思路（供后人参考，不要再走）

1. ❌ **纯文字 OCR 识别装备名** — 游戏字体艺术化，OCR 完全失败
2. ❌ **拆词 + 去前缀模糊匹配优化文字 OCR** — 本质问题没解决
3. ❌ **强歧义检验丢弃** — 召回率灾难，正确匹配被误杀
4. ❌ **等分网格切图** — 不同分辨率/缩放偏移严重
5. ❌ **死亡补装走 pHash** — 击杀详情图装备图标小、品质边框干扰、附魔星标遮挡，精度上限低，已转向官网战报匹配
6. ⚠️ **detectGridRegion 全自动检测装备区** — 在简单场景可用，复杂场景仍需用户辅助

---

## 0.5 当前最佳实践

- **库存批量入库** → 网格识别入库（用户拖红框 + pHash 三层预填 + 数量/品质自动检测 + AutoComplete 别名校对 + 套用↓批量）
- **死亡补装** → Albion 官网战报匹配（文字 OCR + UTC±5min + playerName）
- **OC 碎/领地碎** → "碎"字关键词 + 后段词解析 + 别称匹配

---

---

# 第二部分：完整版本更新记录

## V1.0 安全修复（BL-001~035，35 项）— 2026-04-13

- **6 Critical**：公会激活鉴权、邀请码 SSVIP 鉴权、Webhook verify_token 校验、CSRF 修复
- **14 High**：成员角色权限、Bot Token 隔离、补装通知文案、TypeORM synchronize 关闭、JWT 默认 secret 校验
- **15 Medium**：路由顺序、操作日志公会隔离、refresh token 续期、left 状态降级、left 成员只读、Entity/SQL 迁移统一

## V2.1 测试反馈优化（F-001~022，22 项）— 2026-04-13

- 控制台卡片跳转（成员/装备/补装→对应页面）
- 同步成员 500 错误优化（try-catch + 有意义错误提示）
- 装备参考库菜单仅 SSVIP 可见
- 成员管理：去掉同步按钮 / 系统角色折叠进眼睛图标 / 去掉加入方式列
- 装备品质仅显示 0~4 数字
- 装备参考库 CSV 模板下载
- 库存：等级品质纯数字 / 行内编辑数量 / 数量允许 0 / 批量修改位置 / 操作列仅保留日志按钮
- 补装管理日期范围搜索
- 创建流程移除管理员角色 ID（改到公会设置页）
- 公会设置页重构（基础+高级折叠）

## V2.2 补装箱子+房间分配（F-023~029）— 2026-04-13

- 补装记录新增 `resupply_box` / `resupply_room` 字段
- 昵称正则提取箱子号（`数字-数字` / `大厅+数字`）
- 批量分配房间 API
- 装备聚合排序视图（按装备名 + 装等降序）
- P8+堕神 关键词搜索
- 公会补装房间配置（`guilds.resupply_rooms JSON`）

## V2.3 待办批量+Albion 集成（F-030~042）— 2026-04-13

- 装备库存删除权限修复（super_admin Popconfirm）
- 成员 KOOK 数据真实化（kook_roles 改为 `{role_id, name}` 映射）
- 补装合并视图（按用户+截图+日期聚合）
- OCR 字段独立化（`kill_date`/`map_name`/`game_id`/`guild_name`）
- 预警规则前端页面（CRUD + 记录 + 解决标记）
- 操作日志推送记录 Tab
- CSV 乱码检测 + xlsx 误传提示
- **Albion 装备 API 一键导入** + albion_id 字段 + CLI 脚本

## V2.4~V2.4.3 SSVIP+Albion+OAuth（T-001~014）— 2026-04-13

- syncMembers Token fallback（公会 Token 失败 → 全局 Token）
- super_admin 同步保护（不被误标 left）
- SSVIP 控制台重构（公会列表 Table + 展开成员/库存/补装）
- Albion 过滤优化（排除材料/采集/技能书/鱼）
- KOOK OAuth URL 修复（`/oauth2/authorize` → `/app/oauth2/authorize`）
- Token 交换格式改 application/json

## V2.5 补装系统重构（R-001~005）— 2026-04-14

**重大重构**：
- `equipment_name` → `equipment_ids`（JSON 数组）
- 删 `level/quality/gearScore/category`（从 catalog 带出）
- 一条补装记录 = 一次事件 = 多装备 ID
- 待识别工作区（OCR < 80% 进此区）

## V2.6 BOT 交互（B-001~004）— 2026-04-14

- BOT 入服自动私信（KMarkdown + 激活链接）
- 首次私信自动回复官网宣导
- 私信关键词路由（邀请码/帮助/试用）

## V2.6.1 Bug 修复（BF-001~005）— 2026-04-14

- OCR 竞态条件修复（`createBatch` 改 await）
- OCR 前端字段名修复（`recognizedName` → `equipmentName`）
- 操作日志状态码改"成功/失败"中文
- GuildGuard `params.id` fallback
- KOOK 频道列表 401 优雅处理

## V2.7 测试反馈优化（UI-001~008）— 2026-04-15

- 公会设置：频道/角色下拉选择
- 隐藏高级配置（Bot Token/Verify Token）
- 装备显示格式统一：`{level}{quality}名称 P{gearScore} 部位`
- 录入库存搜索数字前缀过滤 + 50 条
- Webhook 日志增强 + 删除 `/webhook` 端点（只保留 `/callback`）

## V2.7.1 / V2.7.2 pHash + 别称 — 2026-04-15

- 装备参考库 `phash` / `aliases` 字段
- 控制台统计完善

## V2.8 KOOK 消息→补装核心重构（F-043~050）— 2026-04-17

- 卡片消息（type=10）图片提取
- OCR 带坐标识别（`recognizeImageWithCoords`）
- ImageMatchService 区域匹配
- 击杀详情弹窗左面板自动定位（基于"击杀"OCR 坐标）
- **OC 碎纯文字消息**→补装申请
- OC 碎文字解析器（"80牧师风帽" / "62挣脱鞋" / "P9重锤"）

## V2.8.1 Bug 修复（BF-006~010）— 2026-04-17

- KMarkdown 图片提取（type=9）
- pHash fallback 文字 OCR
- OC 碎去重 hash 传入
- OCR region fallback `ap-guangzhou`
- DTO `equipmentIds` 改可选

## V2.8.2 装备图片本地化（F-051~055）— 2026-04-17

- `local_image_path` 字段
- 批量下载（并发控制 + 3 次重试 + 幂等跳过）
- pHash 生成优先读本地

## V2.8.3 pHash 精度优化（F-056~061）— 2026-04-17

- 阈值 19 → 25
- 裁切比例 70% → 60% + maskCorners 四角遮盖
- detectGridRegion 智能检测
- **多候选 iconSize 切割**（5 个候选 0.70~1.30 倍）
- 子图右下角数量自动提取
- 邀请码默认 enabled / pending 公会关联 inviteCodeId / 激活联动 used

## V2.8.4 补装+OC碎+待识别（F-060~063）— 2026-04-17

- 匹配门槛 0.8 → 0.70
- OC 碎文字解析重写（拆词过滤纯数字 + 别称匹配）
- 补装详情 Drawer → Modal（居中 + 隐藏 KOOKID + 隐藏流转日志）
- KOOK 待识别工作区页面

## V2.8.5 击杀详情精度（F-064~070）— 2026-04-18

- 左面板裁切以"击杀详情"OCR 坐标为锚点，限制宽度 ≤ 弹窗 45%
- 每张图最多识别 10 件（按置信度降序）
- 多图单独识别
- 内容级去重：MD5(时间+地点+人+装备IDs 排序)
- SQL 批量去等级前缀（禅师级/专家级等）
- 补装装备显示 `P{装等}{名}` 按部位排序

## V2.8.7~V2.8.9

- 邀请码 12 位 + BOT 重加入复用
- DM `target_id` 修复
- 尾部提示

## V2.9.0 待识别整合+OCR性能（F-100~109）— 2026-04-19

**Batch 1**：
- 公会图标回填入口
- 成员搜索增强（KOOK 角色下拉 + 多条件 + 查询按钮）
- 手动创建补装数量输入（一次添加多个不同装备）
- JWT refresh + 401 续期确认
- 待识别归入补装 Tab（独立菜单删除）
- 待识别批量废弃 / 单条修正 / quickComplete 直接扣库存

**Batch 2**：
- **OCR 性能优化**：matchFromScreenshot 重构 — 先 pHash 匹配再对匹配子图并发数量 OCR
- 击杀详情模式 skipQuantity=true（每件=1）
- 一键创建子账号
- KOOK OAuth 0 公会提示

## V2.9.1 CSV 别称导入+pHash 阈值分档（F-110~116）— 2026-04-19

- CSV 模板新格式：别称, 等级, 品质, 装等, 数量, 位置
- `batchMatch` 三档匹配（精确/别称/模糊，阈值 0.7）
- **pHash 阈值分档**：STRICT(19)/LOOSE(25)
- **歧义差距检验**：最佳 vs 次佳 < 3 丢弃

## V2.9.2 网格识别入库（方案 D）（F-117~127）— 2026-04-19

**质变版本**：
- `gridParseForManualInput`：按网格切图 + 缩略图 base64 + 数量 OCR + 品质边框检测
- `detectQualityFromBorder`：HSV 色相判定品质
- POST `grid-parse` / `grid-save` 端点
- EquipmentModule / OcrModule 循环依赖修复（forwardRef）
- 前端 1200 宽 Modal + AutoComplete 别名 + 套用↓ + 只显示未填筛选
- OCR/CSV 折叠到"更多导入"Dropdown

## V2.9.3 图像识别预览（F-128~135）— 2026-04-19

- `previewMatchWithCandidates`：返回每方框 Top N 候选 + 切图 base64
- 原图红框标注 + Top5 候选展开 + 自动勾选 + 确认按钮
- 补装详情 Modal 嵌入预览按钮
- 待识别 Tab 嵌入 MatchPreview

## V2.9.4 KOOK 登录流程重构（F-136~142）— 2026-04-26

- `getKookOAuthUrl` 区分 `purpose=login/invite`
- `handleKookCallback` 动态 redirectUri
- `getBotInviteUrl` 接口
- KookCallback.tsx 纯登录回调页（popup + 直跳双模式）
- 登录页底部"邀请 BOT 进入 KOOK 服务器"+"前往创建公会"引导
- join 页防护（无邀请码且未登录 → 跳 login）

## V2.9.5 网格切图+搜索增强（F-143~147）— 2026-04-26

- `detectGridRegion` 增强：连续高方差行块定位 + estimateIconSize 细粒度
- catalog.search() 支持 P 装等格式 / 数字前缀 / 别称
- 装备选中显示友好名称
- 已监听频道列表展示
- 补装空数据引导提示

## V2.9.6 消息处理重构+pHash 歧义修复（F-149~155）— 2026-04-26

- 非击杀详情图片直接跳过
- 击杀详情 pHash 全失败仍创建 pending 记录
- 消息自带文字存入 reason
- **pHash 歧义修复**：按装备名分组，同名不同品质不算歧义
- OC 碎关键词扩展为匹配"碎"字
- "碎"后文字作为装备描述区解析
- 繁体关键词支持（擊殺詳細資訊/擊殺詳情）

## V2.9.7 击杀详情分类+装备热度（F-156~159）— 2026-04-27

- 击杀详情左面板 3×4 网格固定布局（包/头/披风/主手/甲/副手/药水/鞋/食物/坐骑），每格只在对应 category 内匹配
- `popularity` 字段（1~5）+ 每天 03:00 统计 `inventory_logs` 扣减次数更新
- 分类匹配按热度 DESC 排序

## V2.9.8 HTTPS+aliases+热门装备（F-160~168）— 2026-04-27

- Nginx + HTTPS 配置 + Certbot 部署脚本
- aliases 批量更新 API + 乱码清理 SQL
- **新增热门装备**：上传游戏内截图 → 多 pHash 取最近
- SSVIP 操作日志修复（`/admin/logs`）
- 离开成员排除非 KOOK 账号
- 补装详情页左图右字段（960 双栏）
- 新增/离开成员统计窗口改为最近 24 小时

## V2.9.9 频道分页+切图重写（F-169~177）— 2026-04-29

- KOOK 频道列表分页（修复 > 50 漏掉）
- 公会 LOGO 自动刷新
- 成员"无角色"反选过滤
- 历史消息拉取超时 30s → 120s
- 预警规则 enabled 字段
- 操作日志隐藏 IP 列
- 手动创建补装搜索改受控 state
- **击杀详情切图重写**：10 格百分比坐标定位（cx/cy）替代等分网格

## V2.9.9.1 阈值+网格重写（F-178~180）— 2026-04-29

- 击杀详情入库阈值 0.70 → **0.55**
- reason 过滤 KOOK 卡片 JSON（以 `[` 或 `{` 开头不拼入）
- 库存网格识别支持 layout 参数（5×7 / 4×5 / 6×8 / 5×2）

## V2.10 OCR 锚点+多图+pHash 预填（F-181~184）— 2026-04-29

- **OCR 锚点定位装备区**：找"搜索/等阶/类别"或"720%"y 坐标
- 网格识别 Radio 单选 + Upload multiple 多图批量
- pHash 自动预填装备名（≥0.55）
- 新增热门装备弹窗重做（搜索已有 + 上传图 + 热度）

## V2.11 Albion 战报+成员同步+图库重构（F-185~191）— 2026-05-13

**重大方向调整**：
- 成员管理拆分双 Tab：公会成员（Albion）+ KOOK 成员
- **Albion 公会成员每日 07:00 同步**（playerId 加入/离开快照 + 按昵称绑定）
- **死亡补装改 Albion 官网战报**（暂停 pHash，文字 OCR + UTC±5min 匹配）
- 新增 `guild_resupply_items` 表（albionId / 装备名 / 等级 / 附魔 / item_quality / 数量）
- 库存/日志/OCR 补齐 `albion_id` 和 `item_quality`
- SSVIP 装备参考库可按 albionId 查官网图片库筛选热门图
- **库存识别分层匹配**：热门库 → 现有 pHash → 官网图库 顺序预填

## V2.11.1 Phase 3 质量修复（HF-001~006）— 2026-05-13

- catalogService `findByAlbionId` 异常改 warn 日志
- KillboardEquipmentItem 增加 JSDoc 注释
- parseAlbionId 支持 `T8_SWORD_UI_SKIN@2` 等复杂格式
- `findAlbionMembers` 索引映射确认（getRawAndEntities）
- **移除 PSC 公会硬编码**（改从 `guilds.albion_guild_id` 读取）
- 清理未使用 import

## V2.12 公会图标+Albion+网格识别重写（T-001~008）— 2026-05-14

- super_admin 可上传公会头像
- 成员列表隐藏 PlayerId + 新增"在公会天数"列
- **库存网格识别完整重写**：6 种容器类型 + 固定红框 + 图片拖拽缩放对齐
- 击杀详情 OCR 坐标定位左面板（parseKillDetailWithCoords）

## V2.12.1 网格识别精度优化（F-200~208）— 2026-05-14

- 前端蓝框比例缩小（考虑 6% 间隙）
- 缩放比改 InputNumber（10%~500% 步长 5%）
- **后端中心点定位法切图重写**：outerRect 均匀定位 + 88% 步长扩展
- pHash 改用 centerThumbnail（去边框角标）
- 数量 OCR + stddev > 25 前置过滤
- 品质边框检测集成
- 搜索结果 value 改 c.name + 增至 20 条
- cols/rows 防御性检查（1~20）
- 空格直接丢弃（stddev < 18）

## V2.12.3 已有公会账号直登+测试修复（F-209~212）— 2026-05-14

- 已有公会账号登录后直进后台（不需邀请码、不需绑定真实 KOOK）
- 手动子账号 `kook_user_id` 使用本地占位 `local-{guildId}-{userId}`
- 测试种子数据同步（004_test_data.sql + 029 迁移）
- 补齐 playwright devDependency 通过 tsc 检查
- README 清理示例 token

---

# 第三部分：版本编号约定

```
V{大版本}.{小版本}[.{修订}]

V1.0    安全修复基础
V2.x    功能迭代（每个 .x 通常对应一个测试反馈批次或重大重构）
V2.x.y  小修订（hotfix / 单点问题）

示例：
V2.9.7  V2.9 大批次第 7 个迭代
V2.11.1 V2.11 的 Phase 3 质量修复
```

任务编号：
- `BL-xxx` Bug List 安全修复
- `F-xxx`  Feature 功能/优化
- `T-xxx`  Test 测试反馈
- `R-xxx`  Refactor 重构
- `B-xxx`  Bot 交互
- `BF-xxx` BugFix 修复
- `HF-xxx` HotFix 紧急修复
- `UI-xxx` UI 调整

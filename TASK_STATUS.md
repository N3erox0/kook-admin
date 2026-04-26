# 任务状态追踪

| 任务ID | 任务名 | 状态 | 完成时间 | 说明 |
|:---|:---|:---|:---|:---|
| BL-001 | 公会激活接口安全加固 | completed | 2026-04-13 14:25 | 激活接口改为需JWT登录，新增activateGuildForUser基于已登录用户激活 |
| BL-002 | 邀请码管理接口SSVIP权限校验 | completed | 2026-04-13 14:25 | generate/list/update-status/disable接口全部添加ensureSSVIP校验 |
| BL-003 | 公会更新接口权限加固 | completed | 2026-04-13 14:25 | updateGuild添加GuildGuard+GuildRoleGuard(SUPER_ADMIN) |
| BL-004 | 获取所有公会列表SSVIP校验 | completed | 2026-04-13 14:25 | getAllGuilds接口添加ensureSSVIP校验 |
| BL-005 | Webhook verify_token验证修复 | completed | 2026-04-13 14:28 | 配置了token时，缺失或不匹配均拒绝 |
| BL-006 | 成员角色修改权限校验 | completed | 2026-04-13 14:25 | updateMemberRole添加GuildRoleGuard(SUPER_ADMIN) |
| BL-007 | 系统超管控制台SSVIP权限校验 | completed | 2026-04-13 14:30 | getAdminOverview添加SSVIP全局角色检查 |
| BL-008 | 操作日志公会隔离 | completed | 2026-04-13 14:30 | 新增/api/guild/:guildId/logs路由，Service添加guildId过滤，保留兼容旧路由 |
| BL-009 | 公会成员列表权限校验 | completed | 2026-04-13 14:25 | getGuildMembers添加GuildGuard |
| BL-010 | KOOK操作接口权限校验 | completed | 2026-04-13 14:28 | reaction/send-message添加ensureAdmin校验 |
| BL-011 | GuildGuard区分left状态成员 | completed | 2026-04-13 14:30 | 查所有状态成员，left成员角色降级为normal只读 |
| BL-012 | 创建公会事务化防双花 | completed | 2026-04-13 14:32 | createGuild改为事务+悲观锁SELECT FOR UPDATE |
| BL-013 | 补装通过通知文案修复 | completed | 2026-04-13 14:34 | 新增notifyResupplyApproved，approve/dispatch通知分离 |
| BL-014 | 补装扣库存精确匹配 | completed | 2026-04-13 14:34 | 优先匹配level/quality/gearScore完全一致的装备 |
| BL-015 | KookController响应格式统一 | completed | 2026-04-13 14:28 | 去掉手动{code:0,data}包装，由TransformInterceptor统一处理 |
| BL-016 | KookController混用返回格式 | completed | 2026-04-13 14:28 | 同BL-015，统一返回格式 |
| BL-017 | 死亡次数预警漏统计修复 | completed | 2026-04-13 14:36 | 移除isCounted=0条件，改为纯日期统计不遗漏 |
| BL-018 | 创建者kookUserId写空修复 | completed | 2026-04-13 14:32 | 从User表获取kookUserId填入guild_member记录 |
| BL-019 | 前端refreshToken续期机制 | completed | 2026-04-13 14:38 | request.ts添加401自动refresh逻辑+请求队列 |
| BL-020 | left成员登录可见公会 | completed | 2026-04-13 14:34 | login/getProfile/kookCallback查询包含left，返回memberStatus |
| BL-021 | JoinPage频道多选统一 | completed | 2026-04-13 14:38 | JoinPage改为多选selectedChannelIds[]，设置kookListenChannelIds |
| BL-022 | SSVIP控制台前端路由修复 | completed | 2026-04-13 14:25 | 已在BUG-007后端修复+GuildRoute排除ssvip逻辑中覆盖 |
| BL-023 | GUILD_ROLES移除ssvip | completed | 2026-04-13 14:38 | types/index.ts移除ssvip（全局角色不应在公会角色选择中） |
| BL-024 | GuildCreate响应格式兼容 | completed | 2026-04-13 14:38 | fetchBotGuilds/handleSelectGuild兼容数组和{data}格式 |
| BL-025 | GuildCreate手动模式跳步修复 | completed | 2026-04-13 14:38 | handleFetchGuild返回boolean，按返回值跳步 |
| BL-026 | 前端保存refreshToken | completed | 2026-04-13 14:38 | auth.store.setAuth增加refreshToken参数，所有登录入口传入 |
| BL-027 | TypeORM synchronize关闭 | completed | 2026-04-13 14:36 | database.config.ts改为synchronize:false，强制使用SQL迁移 |
| BL-028 | Entity与SQL迁移统一管理 | completed | 2026-04-13 14:36 | 通过关闭synchronize强制使用SQL迁移管理schema |
| BL-029 | JWT默认secret生产校验 | completed | 2026-04-13 14:36 | configuration.ts生产环境启动时校验JWT_SECRET必须配置 |
| BL-030 | GuildController路由守卫完整 | completed | 2026-04-13 14:25 | 所有需权限的路由均添加ApiBearerAuth+对应Guard |
| BL-031 | LogModule依赖注册 | completed | 2026-04-13 14:30 | LogModule注册GuildMember/User Entity供GuildGuard使用 |
| BL-032 | 前端Log页面公会隔离 | completed | 2026-04-13 14:38 | log/index.tsx改用/guild/:guildId/logs路由 |
| BL-033 | KookNotify新增approved通知 | completed | 2026-04-13 14:34 | kook-notify.service.ts新增notifyResupplyApproved方法 |
| BL-034 | GuildService事务安全 | completed | 2026-04-13 14:32 | createGuild全流程包裹在事务中，失败自动回滚 |
| BL-035 | 前端auth.store清理refreshToken | completed | 2026-04-13 14:38 | logout时清理refreshToken |
| **V2.1** | **测试反馈修复批次** | | | |
| F-001 | 控制台成员卡片跳转 | completed | 2026-04-13 16:50 | 点击成员总数→成员管理 |
| F-002 | 控制台装备卡片跳转 | completed | 2026-04-13 16:50 | 点击装备总数→装备库存 |
| F-003 | 控制台补装卡片跳转 | completed | 2026-04-13 16:50 | 点击待处理→补装审核 |
| F-004 | 同步成员500错误优化 | completed | 2026-04-13 16:50 | try-catch包裹返回有意义错误信息 |
| F-005 | 装备参考库菜单隐藏 | completed | 2026-04-13 16:50 | 仅SSVIP可见 |
| F-006 | 成员管理去掉同步按钮 | completed | 2026-04-13 16:50 | 改为显示上次同步时间 |
| F-007 | 成员管理系统角色折叠 | completed | 2026-04-13 16:50 | 角色修改折叠进眼睛图标 |
| F-008 | 成员管理去掉加入方式 | completed | 2026-04-13 16:50 | 默认自动同步 |
| F-009 | 成员管理系统角色列后移 | completed | 2026-04-13 16:50 | 系统角色+操作放最后 |
| F-010 | 装备品质仅显示数字 | completed | 2026-04-13 16:50 | 参考库+库存品质改为0-4 |
| F-011 | 装备参考库分页支持100 | completed | 2026-04-13 16:50 | 支持50/100切换 |
| F-012 | 装等允许为空 | completed | 2026-04-13 16:50 | 显示'-'代替P0 |
| F-013 | CSV模板下载 | completed | 2026-04-13 16:50 | 后端/api/catalog/csv-template端点 |
| F-014 | 库存等级品质纯数字 | completed | 2026-04-13 16:50 | 去掉Lv.和品质文字 |
| F-015 | 库存数量行内编辑 | completed | 2026-04-13 16:50 | InputNumber直接修改 |
| F-016 | 库存数量允许0 | completed | 2026-04-13 16:50 | min=0 |
| F-017 | 库存批量修改位置 | completed | 2026-04-13 16:50 | 行选择+批量位置弹窗 |
| F-018 | 库存操作列精简 | completed | 2026-04-13 16:50 | 仅保留日志按钮 |
| F-020 | 补装管理日期范围搜索 | completed | 2026-04-13 16:50 | 后端DTO+Service支持startDate/endDate |
| F-021 | 创建流程移除管理员角色ID | completed | 2026-04-13 16:50 | GuildCreate+JoinPage移除 |
| F-022 | 公会设置页重构 | completed | 2026-04-13 16:50 | 基础配置+高级配置折叠 |
| **V2.2** | **补装箱子编号+房间分配+聚合排序** | | | |
| F-023 | 补装箱子编号字段 | completed | 2026-04-13 17:25 | Entity新增resupplyBox/resupplyRoom，昵称正则提取 |
| F-024 | 昵称解析箱子号 | completed | 2026-04-13 17:25 | parseResupplyBox支持 数字-数字/大厅+数字 |
| F-025 | 批量分配补装房间 | completed | 2026-04-13 17:25 | batch-assign-room API + 前端房间选择弹窗 |
| F-026 | 装备聚合排序视图 | completed | 2026-04-13 17:25 | grouped API按装备名聚合+装等降序 |
| F-027 | P8+堕神关键词搜索 | completed | 2026-04-13 17:25 | findAll+grouped支持装等+名称组合搜索 |
| F-028 | 公会补装房间配置 | completed | 2026-04-13 17:25 | guilds.resupply_rooms JSON字段 |
| F-029 | 数据库迁移SQL | completed | 2026-04-13 17:25 | 009_v2.2_resupply_box.sql |
| **V2.3** | **待办事项批量实现** | | | |
| F-030 | 装备库存删除权限修复 | completed | 2026-04-13 18:20 | 恢复super_admin删除按钮(Popconfirm确认)+DeleteOutlined图标 |
| F-031 | 成员KOOK数据真实化 | completed | 2026-04-13 18:20 | kook-sync同步时角色ID→{role_id,name}映射，前端兼容number[]+object[] |
| F-032 | 补装合并视图 | completed | 2026-04-13 18:25 | 后端GET merged按用户+截图+日期聚合，前端合并/展开表格切换 |
| F-033 | OCR识别字段独立化 | completed | 2026-04-13 18:25 | Entity新增kill_date/map_name/game_id/guild_name，createFromKillDetail写入 |
| F-034 | 预警规则前端页面 | completed | 2026-04-13 18:28 | 规则CRUD+记录查看+解决标记，Tabs切换 |
| F-035 | 操作日志推送记录TAB | completed | 2026-04-13 18:28 | 改为查询scheduled_tasks执行记录，显示任务名/时间/结果/耗时 |
| F-036 | CSV编码检测 | completed | 2026-04-13 18:30 | xlsx误传提示+乱码检测(garbledRatio)+UTF-8编码读取 |
| F-037 | 数据库迁移SQL | completed | 2026-04-13 18:30 | 010_v2.3_resupply_ocr_fields.sql |
| F-038 | 路由顺序修复 | completed | 2026-04-13 18:45 | resupply.controller merged/grouped移到:id之前避免400 |
| F-039 | 前端类型补充 | completed | 2026-04-13 18:45 | GuildResupply接口+killDate/mapName/gameId/ocrGuildName |
| F-040 | 补装详情显示OCR字段 | completed | 2026-04-13 18:45 | Drawer新增击杀日期/地图/游戏ID/公会名行 |
| F-041 | Albion装备导入后端 | completed | 2026-04-13 19:50 | catalog.service importFromAlbion()+albionId字段+category解析+迁移SQL |
| F-042 | Albion装备导入前端 | completed | 2026-04-13 19:50 | catalog页"导入Albion装备"按钮+Popconfirm+loading |
| F-043 | Albion CLI导入脚本 | completed | 2026-04-13 19:50 | scripts/import-albion-data.ts生成SQL INSERT语句 |
| T-001 | syncMembers Token fallback | completed | 2026-04-13 22:40 | 优先公会Token，假Token(test-)fallback全局Token |
| T-003 | syncMembers超管保护 | completed | 2026-04-13 22:40 | 标记离开时跳过super_admin角色，防误标 |
| T-006 | SSVIP控制台卡片跳转 | completed | 2026-04-13 22:40 | 公会数/用户/邀请码/参考库卡片onClick跳转 |
| T-007 | SSVIP控制台重构 | completed | 2026-04-13 22:40 | 公会列表Table+expandable展开成员/库存/补装 |
| T-008 | Albion过滤规则优化 | completed | 2026-04-13 23:00 | 排除材料/采集/技能书/鱼等，保留装备/药水/食物/坐骑 |
| T-009 | Albion品质解析 | completed | 2026-04-13 23:00 | @N后缀→quality，gearScore=tier+quality |
| T-011 | KOOK OAuth URL修复 | completed | 2026-04-13 23:19 | /oauth2/authorize→/app/oauth2/authorize |
| T-012 | KOOK OAuth Token交换格式 | completed | 2026-04-13 23:19 | Content-Type改为application/json |
| T-013 | dashboard syncMembers前置检查修复 | completed | 2026-04-13 23:24 | 去掉kookBotToken必填检查，与kook-sync一致 |
| T-014 | scheduler定时任务前置检查修复 | completed | 2026-04-13 23:24 | 去掉kookBotToken必填检查，与kook-sync一致 |
| R-001 | 补装表字段重构 | completed | 2026-04-14 14:30 | equipment_name→equipment_ids，删level/quality/gearScore/category |
| R-002 | 补装Service重构 | completed | 2026-04-14 14:30 | 一条记录=一次事件=多装备ID，quantity=总件数，逐ID扣库存 |
| R-003 | 前端补装列表重构 | completed | 2026-04-14 14:30 | 多装备名显示+手动创建多选列表模式 |
| R-004 | 待识别工作区 | completed | 2026-04-14 14:30 | OCR batch增加source/kookUserId，KOOK<80%进待识别区 |
| R-005 | KOOK消息处理重构 | completed | 2026-04-14 14:30 | 一条记录=一次事件，低置信度进待识别工作区 |
| B-001 | Bot入服记录 | completed | 2026-04-14 15:10 | self_joined_guild→获取服务器主→写入bot_join_records |
| B-002 | Bot入服私信 | completed | 2026-04-14 15:10 | KMarkdown私信服务器主带邀请码注册链接 |
| B-003 | 首次私信宣导 | completed | 2026-04-14 15:10 | channel_type=PERSON首次私信→自动回复官网宣导 |
| B-004 | 私信关键词路由 | completed | 2026-04-14 15:10 | 邀请码/帮助/试用→对应回复模板 |
| **V2.6.1** | **Bug 修复批次** | | | |
| BF-001 | OCR竞态条件修复 | completed | 2026-04-14 23:07 | createBatch改为await同步等待识别完成 |
| BF-002 | OCR前端字段名修复 | completed | 2026-04-14 23:07 | recognizedName→equipmentName |
| BF-003 | 操作日志状态显示优化 | completed | 2026-04-14 23:07 | 状态码200→"成功"，4xx/5xx→"失败" |
| BF-004 | GuildGuard参数兼容 | completed | 2026-04-14 23:07 | params.guildId加params.id fallback |
| BF-005 | KOOK频道列表401优雅处理 | completed | 2026-04-14 23:07 | try-catch返回空数组+错误提示 |
| **V2.7** | **测试反馈优化批次** | | | |
| UI-001 | 公会设置：频道/角色下拉选择 | completed | 2026-04-15 00:17 | 通知频道+管理员角色改为Select下拉 |
| UI-002 | 公会设置：隐藏高级配置 | completed | 2026-04-15 00:17 | 删除Bot Token/Verify Token折叠区 |
| UI-003 | 装备显示格式统一 | completed | 2026-04-15 00:17 | {level}{quality}名称 P{gearScore} 部位 |
| UI-004 | 录入库存：搜索数字前缀过滤 | completed | 2026-04-15 00:17 | 输入44堕神→搜索堕神 |
| UI-005 | 录入库存：搜索结果50条 | completed | 2026-04-15 00:17 | limit 20→50 |
| UI-006 | Webhook日志增强 | completed | 2026-04-15 00:17 | callback端点加详细请求/解析/结果日志 |
| UI-007 | 删除/webhook端点 | completed | 2026-04-15 00:17 | 只保留/callback |
| UI-008 | OAuth弹窗防护 | completed | 2026-04-15 00:17 | popup=null时提示+取消loading |
| **V2.8** | **KOOK消息→补装申请核心重构** | | | |
| F-043 | extractImageUrl支持type=10卡片消息 | completed | 2026-04-17 18:50 | 解析KOOK Card Message中container/image元素的src |
| F-044 | OCR带坐标识别(recognizeImageWithCoords) | completed | 2026-04-17 18:50 | 调用腾讯云OCR返回ItemPolygon文字坐标 |
| F-045 | ImageMatchService.matchFromRegion区域匹配 | completed | 2026-04-17 18:50 | 指定区域裁切后执行pHash匹配 |
| F-046 | processImageMessage重构双通道 | completed | 2026-04-17 18:50 | OCR元数据提取+pHash图片匹配，替代纯文字OCR |
| F-047 | 击杀详情弹窗左面板自动定位 | completed | 2026-04-17 18:50 | 基于OCR文字坐标检测"击杀"/"击杀详情"位置推算左面板区域 |
| F-048 | OC碎纯文字消息→补装申请 | completed | 2026-04-17 18:50 | KOOK频道文字含"OC碎"触发补装(applyType=OC碎) |
| F-049 | OC碎文字解析器 | completed | 2026-04-17 18:50 | 解析"80牧师风帽""62挣脱鞋""P9重锤"等格式 |
| F-050 | KookModule依赖补全 | completed | 2026-04-17 18:50 | 导入EquipmentCatalogModule供CatalogService注入 |
| **V2.8.1** | **BUG修复批次** | | | |
| BF-006 | extractImageUrl增强KMarkdown | completed | 2026-04-17 21:30 | 新增type=9 KMarkdown图片提取+通用URL兜底匹配 |
| BF-007 | pHash匹配fallback文字OCR | completed | 2026-04-17 21:30 | matchResults为空时fallback到recognizeImage+enrichWithCatalog |
| BF-008 | OC碎去重hash传入create | completed | 2026-04-17 21:30 | dedupHash通过_dedupHash传入+前置findByDedupHash去重 |
| BF-009 | OCR region fallback默认值 | completed | 2026-04-17 21:30 | 3处region配置增加\|\|'ap-guangzhou'默认值 |
| BF-010 | DTO equipmentIds改为可选 | completed | 2026-04-17 21:30 | @IsOptional()+@IsString()，OC碎无匹配也能创建 |
| **V2.8.2** | **装备图片本地化+pHash优化** | | | |
| F-051 | equipment_catalog新增localImagePath | completed | 2026-04-17 21:45 | Entity+SQL迁移新增local_image_path字段 |
| F-052 | 批量下载Albion装备图片 | completed | 2026-04-17 21:45 | downloadAllImages方法：并发控制+3次重试+幂等跳过 |
| F-053 | POST download-images接口 | completed | 2026-04-17 21:45 | SSVIP权限，支持自定义并发数 |
| F-054 | pHash生成优先读本地文件 | completed | 2026-04-17 21:45 | generatePhashForCatalog优先localImagePath，fallback远程URL |
| F-055 | batchGeneratePhash本地优先 | completed | 2026-04-17 21:45 | 查询增加localImagePath字段并传入生成方法 |
| **V2.8.3** | **pHash匹配精度优化+数量自动回填** | | | |
| F-056 | pHash匹配阈值降低 | completed | 2026-04-17 22:50 | HAMMING_THRESHOLD 19→25（相似度≥60%），提升匹配容忍度 |
| F-057 | cropCenter遮盖四角+比例调整 | completed | 2026-04-17 22:50 | 裁切前遮盖左上(等级)/右上(五角星)/右下(数量)+比例70%→60% |
| F-058 | 装备区域智能检测 | completed | 2026-04-17 22:50 | detectGridRegion基于行方差自动裁掉顶部/底部UI |
| F-059 | 多候选iconSize切割 | completed | 2026-04-17 22:50 | 遍历5个候选尺寸(0.70~1.30倍)，取最多子图组合 |
| F-060 | 子图右下角数量自动提取 | completed | 2026-04-17 22:50 | extractQuantityFromCorner+腾讯云OCR数字识别 |
| F-061 | processRecognition适配quantity | completed | 2026-04-17 22:50 | OCR结果回填提取到的数量而非硬编码1 |
| **V2.8.3** | **邀请码状态修复** | | | |
| F-056 | 邀请码前端状态文案修正 | completed | 2026-04-17 21:55 | disabled→"未启用"，used→"已使用"（invite-codes+types） |
| F-057 | BOT邀请码默认enabled | completed | 2026-04-17 21:55 | self_joined_guild生成邀请码status改为ENABLED |
| F-058 | pending公会关联inviteCodeId | completed | 2026-04-17 21:55 | 创建pending公会时写入inviteCodeId，已有公会补充关联 |
| F-059 | 激活路径邀请码used联动 | completed | 2026-04-17 21:55 | activateGuild/activateGuildForUser激活后标记邀请码为used+写入绑定信息 |
| **V2.8.4** | **补装+OC碎+待识别工作区** | | | |
| F-060 | pHash置信度门槛调整 | completed | 2026-04-17 23:10 | KOOK自动补装门槛从0.8降到0.70，<0.70才进待识别 |
| F-061 | OC碎文字解析重写 | completed | 2026-04-17 23:10 | 拆词过滤纯数字+逐个匹配参考库，有未匹配→整条进待识别 |
| F-062 | 补装详情Drawer→Modal | completed | 2026-04-17 23:10 | 居中弹窗+隐藏KOOKID+隐藏流转日志 |
| F-063 | KOOK待识别工作区页面 | completed | 2026-04-17 23:10 | 新增kook-pending页面+路由+菜单项+API封装 |
| **V2.8.5** | **击杀详情精度+多图+去重+显示格式** | | | |
| F-064 | 左面板裁切精度优化 | completed | 2026-04-18 02:50 | 以"击杀详情"OCR坐标为锚点，限制宽度≤弹窗45% |
| F-065 | 每张图最多识别10件 | completed | 2026-04-18 02:50 | 按置信度降序取前10件 |
| F-066 | 多图单独识别 | completed | 2026-04-18 02:50 | extractAllImageUrls返回数组，逐图处理 |
| F-067 | 内容级去重 | completed | 2026-04-18 02:50 | MD5(时间+地点+人+装备IDs排序)，不同图片相同内容跳过 |
| F-068 | 装备参考库去等级前缀 | completed | 2026-04-18 02:50 | SQL批量去除禅师级/专家级等前缀 |
| F-069 | 补装装备显示P{装等}{名}按部位排序 | completed | 2026-04-18 02:50 | 武器→副手→头→甲→鞋顺序 |
| F-070 | .env.example修复 | completed | 2026-04-18 02:50 | FRONTEND_URL去重 |
| **V2.9.0** | **待识别整合+补装体验增强（Batch 1）** | | | |
| F-100 | 公会图标回填入口 | completed | 2026-04-19 06:20 | Layout 用户菜单新增"刷新公会图标"，调用 /kook/guild/:id/refresh-info 从KOOK拉取icon_url回填 |
| F-101 | 成员列表搜索增强 | completed | 2026-04-19 06:20 | KOOK角色下拉(从列表汇总)+昵称+状态+【查询】按钮组合触发；后端DTO新增kookRoleId，JSON_CONTAINS过滤kook_roles |
| F-103 | 手动创建补装装备数量输入 | completed | 2026-04-19 06:20 | 创建Modal每件装备支持InputNumber 1-99；后端新增equipmentEntries DTO字段，按数量展开为equipmentIds |
| F-105 | JWT refresh + 401自动续期 | completed | 2026-04-19 06:20 | 确认后端 /api/auth/refresh 端点与前端 axios 拦截器已就绪 |
| F-107 | 待识别归属调整：独立菜单→补装Tab | completed | 2026-04-19 06:20 | Layout 菜单删除"待识别工作区"；ResupplyPage 顶部加 Tabs：补装列表/待识别；旧路由重定向 |
| F-108a | 待识别批量废弃 | completed | 2026-04-19 06:20 | PendingRecognitionTab 复选框+批量废弃按钮，后端新增 batch-reject 端点 |
| F-108b | 待识别单条修正+快捷完成 | completed | 2026-04-19 06:20 | 修改装备列表(含数量)→创建resupply→直接扣库存+标记DISPATCHED，后端新增 /quick-complete 端点 |
| F-108c | OC碎无有效词段入待识别 | completed | 2026-04-19 06:20 | kook-message.service.ts 的 segments.length===0 分支改为 createKookBatch |
| F-109 | 待补装备区域放大显示 | completed | 2026-04-19 06:20 | 补装详情页加【放大查看】按钮→900宽Modal全览equipmentDetails |
| **V2.9.0** | **OCR性能修复+子账号+登录扩展（Batch 2）** | | | |
| F-104 | OCR数量识别性能优化 | completed | 2026-04-19 06:35 | 重构matchFromScreenshot：先pHash匹配再对匹配子图并发数量OCR（MAX_QUANTITY_OCR=30，CONCURRENCY=3）；击杀详情模式skipQuantity=true每件=1 |
| F-106.2 | 击杀详情模式跳过数量OCR | completed | 2026-04-19 06:35 | matchFromRegion传入{skipQuantity:true}；抹黑星星+等级+数量已在maskCorners |
| F-102C | 一键创建子账号 | completed | 2026-04-19 06:40 | 后端 /guilds/:id/sub-account，超管限定，自动生成用户名{abbr}{2字母}{4数字}+8位密码；前端公会设置页Modal，一次性显示账密+复制 |
| F-102A | KOOK OAuth登录0公会提示 | completed | 2026-04-19 06:45 | GuildSelect页 Empty 文案增强为"您尚未加入任何公会+请向公会管理员索取邀请码" |
| **V2.9.1** | **CSV别称导入+OCR精度修复** | | | |
| F-110 | CSV模板下载带Token | completed | 2026-04-19 07:50 | 前端改用axios request.get+responseType:blob下载，解决401 |
| F-111 | CSV模板字段调整 | completed | 2026-04-19 07:50 | 新格式：别称,等级,品质,装等,数量,位置（兼容旧格式5列） |
| F-112 | batchMatch支持别称+模糊匹配 | completed | 2026-04-19 07:50 | 先精确匹配，失败后调findByNameFuzzy(0.7)，返回matchType(exact/alias/fuzzy/none) |
| F-113 | CSV导入预览显示匹配结果 | completed | 2026-04-19 07:50 | 新增"匹配装备"列+matchType Tag（绿=精确/蓝=别称/橙=模糊/红=未匹配） |
| F-114 | pHash阈值分档策略 | completed | 2026-04-19 07:50 | STRICT(19≥70%)装备库存页/LOOSE(25≥60%)击杀详情，matchFromScreenshot新增strict参数 |
| F-115 | 次佳差距歧义检验 | completed | 2026-04-19 07:50 | 匹配时记录bestDistance+secondBestDistance，差距<3判定为歧义匹配丢弃 |
| F-116 | 装备库存OCR使用严格模式 | completed | 2026-04-19 07:50 | ocr.service.ts processRecognition调用matchFromScreenshot传{strict:true} |
| **V2.9.2** | **网格识别入库（方案D）+ 按钮整理** | | | |
| F-117 | ImageMatchService.gridParseForManualInput | completed | 2026-04-19 08:15 | 按网格切图→每格缩略图base64+右下角数量OCR+边框色品质检测，最多60格并发3 |
| F-118 | detectQualityFromBorder | completed | 2026-04-19 08:15 | HSV色相判定品质：灰Q0/绿Q1/蓝Q2/紫Q3/金Q4 |
| F-119 | extractQuantityFromCorner改public | completed | 2026-04-19 08:15 | 供EquipmentService复用 |
| F-120 | POST grid-parse端点+gridParse方法 | completed | 2026-04-19 08:15 | EquipmentController+Service，获取imageUrl→Buffer→调用imageMatchService.gridParseForManualInput |
| F-121 | POST grid-save端点+gridSave方法 | completed | 2026-04-19 08:15 | 逐条findByNameFuzzy(0.7)匹配catalogId→upsert叠加入库，返回success/failed/failures明细 |
| F-122 | EquipmentModule/OcrModule循环依赖修复 | completed | 2026-04-19 08:15 | 双向forwardRef防循环，EquipmentService注入ImageMatchService+CatalogService |
| F-123 | 前端API: gridParseInventory/gridSaveInventory | completed | 2026-04-19 08:15 | client/src/api/equipment.ts |
| F-124 | 前端网格识别入库Modal | completed | 2026-04-19 08:15 | 1200宽Modal：上传→解析→缩略图+AutoComplete别名+等级/品质/数量/位置可编辑+套用↓+只显示未填筛选 |
| F-125 | AutoComplete别名搜索 | completed | 2026-04-19 08:15 | 输入时实时调searchCatalog，显示装备名(T/Q)+别称 |
| F-126 | 批量"套用↓"功能 | completed | 2026-04-19 08:15 | 将当前行别名/等级/品质/位置应用到下方所有未填行 |
| F-127 | OCR/CSV按钮折叠到Dropdown | completed | 2026-04-19 08:15 | "网格识别入库"设为主按钮，OCR/Excel导入/下载CSV模板收入"更多导入"Dropdown |
| **V2.9.3** | **补装申请图像识别预览（原图+方框+Top5候选+勾选确认）** | | | |
| F-128 | ImageMatchService.previewMatchWithCandidates | completed | 2026-04-19 08:30 | 新方法：返回每个方框的Top N候选+切图base64+原图坐标，不聚合不去歧义，供预览UI使用 |
| F-129 | ResupplyService.previewMatchForResupply/FromUrl | completed | 2026-04-19 08:30 | 下载screenshotUrl→调用ImageMatchService→返回{originalUrl,imgWidth,imgHeight,boxes[]} |
| F-130 | POST resupply/:id/preview-match + preview-from-url | completed | 2026-04-19 08:30 | ResupplyController两个新端点，SUPER_ADMIN/RESUPPLY_STAFF可用 |
| F-131 | ResupplyModule forwardRef(OcrModule) | completed | 2026-04-19 08:30 | 引入ImageMatchService依赖 |
| F-132 | 前端API previewMatchResupply/previewMatchFromUrl | completed | 2026-04-19 08:30 | client/src/api/resupply.ts 两个新方法 |
| F-133 | MatchPreview.tsx 通用组件 | completed | 2026-04-19 08:30 | 原图预览(红框标注已勾选)+方框列表(小图+勾选)+匹配结果表(相似度排序/Top5展开/自动勾选)+确认按钮 |
| F-134 | 补装详情Modal嵌入"图像识别预览"按钮 | completed | 2026-04-19 08:30 | 点击截图旁按钮→1100宽子Modal→勾选确认→调quickCompleteResupply扣库存+完成 |
| F-135 | PendingRecognitionTab嵌入MatchPreview | completed | 2026-04-19 08:30 | 修正Modal改1100宽+Collapse折叠面板，勾选结果自动合并到editEquipList |
| **V2.9.4** | **KOOK登录流程重构+BOT邀请引导** | | | |
| F-136 | getKookOAuthUrl区分登录/邀请场景 | completed | 2026-04-26 17:00 | 新增purpose参数：login→回调/auth/kook-callback，invite→回调/join |
| F-137 | handleKookCallback动态redirectUri | completed | 2026-04-26 17:00 | callbackPath参数替代写死/join，与OAuth授权阶段的redirect_uri一致 |
| F-138 | getBotInviteUrl新接口 | completed | 2026-04-26 17:00 | GET /auth/kook/bot-invite-url，返回KOOK BOT邀请链接（scope=bot） |
| F-139 | KookCallback.tsx纯登录回调页 | completed | 2026-04-26 17:00 | 新建/auth/kook-callback路由，popup→postMessage/直跳dashboard双模式 |
| F-140 | 登录页引导区 | completed | 2026-04-26 17:00 | 底部"邀请BOT进入KOOK服务器"+"有邀请码？前往创建公会"引导 |
| F-141 | join页无邀请码防护 | completed | 2026-04-26 17:00 | 无OAuth code且无邀请码且未登录→跳/login |
| F-142 | join页handleKookLogin传purpose=invite | completed | 2026-04-26 17:00 | 确保邀请场景始终回调到/join |
| **V2.9.5** | **网格切图优化+搜索增强+UI优化** | | | |
| F-143 | 网格识别切图优化 | completed | 2026-04-26 18:25 | detectGridRegion增强：安全裁剪12%+8%UI区域、连续高方差行块定位、estimateIconSize细粒度列数估算 |
| F-144 | 装备搜索增强 | completed | 2026-04-26 18:25 | catalog.service.search()支持P装等格式/数字前缀连写/别称aliases双字段搜索 |
| F-145 | 装备录入显示优化 | completed | 2026-04-26 18:25 | 选中后显示友好名称(62堕神法杖 P8 武器)而非catalogId，统一所有搜索页面 |
| F-146 | 已监听频道列表显示 | completed | 2026-04-26 18:25 | GuildSettings.tsx增加已监听频道Tag列表+最后配置时间 |
| F-147 | 补装管理空数据引导 | completed | 2026-04-26 18:25 | Table locale.emptyText增加4种可能原因和操作指引 |
| **V2.9.6** | **消息处理逻辑重构+pHash歧义修复** | | | |
| F-149 | 非击杀详情图片跳过 | completed | 2026-04-26 22:55 | processImageMessage先OCR判断是否击杀详情/擊殺詳細資訊，不是则直接return |
| F-150 | 击杀详情pHash全失败仍创建pending记录 | completed | 2026-04-26 22:55 | 匹配0件也创建死亡补装记录(status=pending)，管理员手动补装备 |
| F-151 | 消息自带文字存入reason字段 | completed | 2026-04-26 22:55 | KMarkdown/卡片消息的文字内容作为备注保存到reason |
| F-152 | pHash歧义修复-同名不同品质合并 | completed | 2026-04-26 22:55 | 匹配时按装备名分组，同名不同品质视为同一装备，歧义检验改为不同装备名之间比较 |
| F-153 | OC碎关键词扩展 | completed | 2026-04-26 22:55 | isOcBrokenMessage改为匹配"碎"字，覆盖OC碎/mass碎/领地碎等所有变体 |
| F-154 | OC碎解析优化-"碎"后文字为装备区 | completed | 2026-04-26 22:55 | 以第一个"碎"字为分界，"碎"后文字作为装备描述区高亮解析 |
| F-155 | 繁体关键词支持 | completed | 2026-04-26 22:55 | parseKillDetail增加"擊殺詳細資訊"/"擊殺詳情"正则匹配 |
| **V2.9.7** | **击杀详情分类匹配+装备热度** | | | |
| F-156 | 击杀详情左面板固定格子分类匹配 | completed | 2026-04-27 00:14 | 左面板3×4网格固定布局(包/头/披风/主手/甲/副手/药水/鞋/食物/坐骑)，每格只在对应category内匹配 |
| F-157 | 装备热度字段+定时任务 | completed | 2026-04-27 00:14 | equipment_catalog新增popularity 1~5，每天03:00统计inventory_logs扣减次数更新热度 |
| F-158 | 分类匹配按热度排序 | completed | 2026-04-27 00:14 | matchKillDetailSlots查询参考库时按popularity DESC排序，热门装备优先匹配 |
| F-159 | V2.9.6.1修复整合 | completed | 2026-04-27 00:14 | 移除歧义检验+flatten修复alpha通道+batchGeneratePhash默认强制重算 |







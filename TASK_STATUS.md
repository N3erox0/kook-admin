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

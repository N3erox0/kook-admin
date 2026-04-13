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

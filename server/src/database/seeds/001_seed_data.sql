-- 种子数据：初始角色、权限、管理员账号
-- 密码: admin123 (bcrypt hash)

USE kook_admin;

-- 初始角色
INSERT INTO `roles` (`name`, `display_name`, `description`) VALUES
('super_admin', '超级管理员', '拥有所有权限'),
('admin', '管理员', '管理后台操作权限'),
('operator', '操作员', '日常操作权限');

-- 初始权限
INSERT INTO `permissions` (`module`, `action`, `display_name`, `description`) VALUES
('member', 'view', '查看成员', '查看成员列表和详情'),
('member', 'sync', '同步成员', '手动触发 KOOK 成员同步'),
('equipment', 'view', '查看装备', '查看装备库存列表'),
('equipment', 'create', '新增装备', '新增装备库存记录'),
('equipment', 'edit', '编辑装备', '编辑装备库存记录'),
('equipment', 'delete', '删除装备', '删除装备库存记录'),
('equipment', 'export', '导出装备', '导出装备库存数据'),
('ocr', 'use', '使用OCR', '使用 OCR 识别功能'),
('resupply', 'view', '查看补装', '查看补装申请列表'),
('resupply', 'create', '创建补装', '创建补装申请'),
('resupply', 'process', '处理补装', '审批处理补装申请'),
('alert', 'view', '查看预警', '查看预警记录'),
('alert', 'manage', '管理预警', '管理预警规则'),
('log', 'view', '查看日志', '查看操作日志'),
('permission', 'view', '查看权限', '查看角色和权限配置'),
('permission', 'manage', '管理权限', '管理角色和权限分配'),
('user', 'view', '查看用户', '查看用户列表'),
('user', 'manage', '管理用户', '管理用户账号'),
('dashboard', 'view', '查看控制台', '查看控制台统计数据');

-- 超级管理员拥有所有权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`;

-- 管理员拥有除权限管理外的所有权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, id FROM `permissions` WHERE `module` != 'permission' OR `action` = 'view';

-- 操作员拥有查看和日常操作权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 3, id FROM `permissions` WHERE `action` IN ('view', 'create', 'use');

-- 初始管理员账号 (密码: admin123)
INSERT INTO `users` (`username`, `password_hash`, `nickname`, `status`) VALUES
('admin', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '系统管理员', 1);

-- 分配超级管理员角色
INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES (1, 1);

-- 初始装备类型
INSERT INTO `equipment_types` (`name`, `code`, `icon`, `sort_order`) VALUES
('武器', 'weapon', 'sword', 1),
('防具', 'armor', 'shield', 2),
('饰品', 'accessory', 'gem', 3),
('消耗品', 'consumable', 'flask', 4),
('材料', 'material', 'box', 5),
('特殊装备', 'special', 'star', 6);

-- 初始定时任务记录
INSERT INTO `scheduled_tasks` (`task_name`, `cron_expression`, `status`) VALUES
('KOOK成员同步', '0 0 1 * * *', 1),
('装备库存预警刷新', '0 0 2 * * *', 1);

-- 初始 KOOK 配置
INSERT INTO `kook_config` (`config_key`, `config_value`, `description`) VALUES
('bot_token', '', 'KOOK Bot Token'),
('guild_id', '', 'KOOK 服务器 ID'),
('resupply_channel_id', '', '补装通知频道 ID'),
('sync_enabled', 'true', '是否启用自动同步'),
('notify_enabled', 'true', '是否启用消息通知');

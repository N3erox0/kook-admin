-- ============================================================
-- KOOK 装备管理后台 - V2 种子数据
-- 修订权限体系为4个固定角色
-- 执行前确保 002_v2_schema_update.sql 已执行
-- ============================================================

USE kook_admin;

-- ============================================================
-- 1. 清理旧角色权限数据（重建）
-- ============================================================

DELETE FROM `role_permissions`;
DELETE FROM `user_roles`;
DELETE FROM `roles`;

-- ============================================================
-- 2. 新建4个固定角色
-- ============================================================

INSERT INTO `roles` (`id`, `name`, `display_name`, `description`) VALUES
  (1, 'super_admin', '超级管理员', '拥有全部权限，可管理系统所有功能'),
  (2, 'inventory_admin', '库存管理员', '成员查看、库存管理、补装处理、预警设置'),
  (3, 'observer', '观察员', '仅可查看成员、库存、补装记录，不可操作'),
  (4, 'member', '普通成员', '仅可在 KOOK 提交补装申请');

-- ============================================================
-- 3. 更新权限列表（新增补装发放、Excel导入等权限）
-- ============================================================

-- 先清理再重建
DELETE FROM `permissions`;

INSERT INTO `permissions` (`id`, `module`, `action`, `display_name`, `description`) VALUES
  (1,  'dashboard', 'view',     '查看控制台',    '查看控制台统计数据'),
  (2,  'member',    'view',     '查看成员',     '查看成员列表和详情'),
  (3,  'member',    'sync',     '同步成员',     '手动触发 KOOK 成员同步'),
  (4,  'equipment', 'view',     '查看装备',     '查看装备库存列表'),
  (5,  'equipment', 'create',   '新增装备',     '新增装备库存记录'),
  (6,  'equipment', 'edit',     '编辑装备',     '编辑装备库存记录'),
  (7,  'equipment', 'delete',   '删除装备',     '删除装备库存记录'),
  (8,  'equipment', 'import',   '导入装备',     '通过 Excel/CSV 批量导入装备'),
  (9,  'equipment', 'export',   '导出装备',     '导出装备库存数据'),
  (10, 'ocr',       'use',      '使用OCR',      '使用 OCR 识别功能'),
  (11, 'resupply',  'view',     '查看补装',     '查看补装申请列表'),
  (12, 'resupply',  'process',  '处理补装',     '审批处理补装申请（通过/驳回）'),
  (13, 'resupply',  'dispatch', '发放补装',     '发放补装并扣减库存'),
  (14, 'alert',     'view',     '查看预警',     '查看预警记录'),
  (15, 'alert',     'manage',   '管理预警',     '管理预警规则配置'),
  (16, 'log',       'view',     '查看日志',     '查看操作日志'),
  (17, 'permission','view',     '查看权限',     '查看角色和权限配置'),
  (18, 'permission','manage',   '管理权限',     '管理角色和权限分配'),
  (19, 'user',      'view',     '查看用户',     '查看用户列表'),
  (20, 'user',      'manage',   '管理用户',     '管理用户账号'),
  (21, 'kook',      'bot',      'KOOK机器人',   '管理 KOOK 机器人配置和命令');

-- ============================================================
-- 4. 分配角色权限
-- ============================================================

-- 超级管理员：全部权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`;

-- 库存管理员：成员查看 + 库存管理 + 补装处理/发放 + 预警设置 + OCR + 日志 + 控制台
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 2, `id` FROM `permissions`
WHERE (`module` = 'dashboard' AND `action` = 'view')
   OR (`module` = 'member'    AND `action` = 'view')
   OR (`module` = 'equipment')
   OR (`module` = 'ocr')
   OR (`module` = 'resupply')
   OR (`module` = 'alert')
   OR (`module` = 'log'       AND `action` = 'view');

-- 观察员：仅查看权限
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 3, `id` FROM `permissions`
WHERE `action` = 'view';

-- 普通成员：无后台权限（仅 KOOK 端提交补装，无需后台权限分配）
-- 不插入任何权限记录

-- ============================================================
-- 5. 重新分配管理员用户角色
-- ============================================================

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES (1, 1);

-- ============================================================
-- 6. 更新装备类型为部位字典（保留表但改为部位参考）
-- ============================================================

DELETE FROM `equipment_types`;

INSERT INTO `equipment_types` (`name`, `code`, `icon`, `sort_order`, `status`) VALUES
  ('武器',  'weapon',  'sword',  1, 1),
  ('头',    'head',    'crown',  2, 1),
  ('甲',    'armor',   'shield', 3, 1),
  ('鞋',    'boots',   'boot',   4, 1),
  ('副手',  'offhand', 'hand',   5, 1),
  ('披风',  'cloak',   'wind',   6, 1),
  ('坐骑',  'mount',   'horse',  7, 1),
  ('其他',  'other',   'box',    8, 1);

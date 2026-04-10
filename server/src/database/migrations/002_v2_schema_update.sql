-- ============================================================
-- KOOK 装备管理后台 - V2 增量迁移脚本
-- 功能修订：成员状态/库存唯一键/补装发放流程/预警多维度
-- MySQL 8.0+ | 执行前请先备份数据库
-- ============================================================

USE kook_admin;

-- ============================================================
-- 1. members 表：移除在线/同步状态，新增成员状态和离开时间
-- ============================================================

-- 新增 status 字段 (normal/new/left)
ALTER TABLE `members`
  ADD COLUMN `status` varchar(10) NOT NULL DEFAULT 'normal' COMMENT '成员状态: normal正常 new新增 left已离开' AFTER `kook_roles`;

-- 新增 left_at 离开时间
ALTER TABLE `members`
  ADD COLUMN `left_at` datetime DEFAULT NULL COMMENT '离开时间' AFTER `joined_at`;

-- 数据迁移：将旧的 sync_status 映射到新 status
UPDATE `members` SET `status` = 'normal' WHERE `sync_status` = 1;
UPDATE `members` SET `status` = 'left' WHERE `sync_status` = 0;

-- 移除旧字段
ALTER TABLE `members` DROP COLUMN `online_status`;
ALTER TABLE `members` DROP COLUMN `sync_status`;

-- 移除旧索引，新增状态索引
DROP INDEX `idx_members_sync_status` ON `members`;
ALTER TABLE `members` ADD INDEX `idx_members_status` (`status`);
ALTER TABLE `members` ADD INDEX `idx_members_joined` (`joined_at`);
ALTER TABLE `members` ADD INDEX `idx_members_left` (`left_at`);

-- ============================================================
-- 2. equipment_inventory 表：完全重构（仓库模式，非成员绑定）
-- ============================================================

-- 先移除外键约束
ALTER TABLE `equipment_inventory` DROP FOREIGN KEY `fk_inv_member`;
ALTER TABLE `equipment_inventory` DROP FOREIGN KEY `fk_inv_type`;

-- 移除旧索引
DROP INDEX `idx_inventory_member_type` ON `equipment_inventory`;
DROP INDEX `idx_inventory_type` ON `equipment_inventory`;

-- 移除旧字段
ALTER TABLE `equipment_inventory` DROP COLUMN `member_id`;
ALTER TABLE `equipment_inventory` DROP COLUMN `type_id`;
ALTER TABLE `equipment_inventory` DROP COLUMN `enhancement_level`;
ALTER TABLE `equipment_inventory` DROP COLUMN `ocr_verified`;
ALTER TABLE `equipment_inventory` DROP COLUMN `screenshot_url`;

-- 修改 quality 为整数类型（品质 0~4）
ALTER TABLE `equipment_inventory` MODIFY COLUMN `quality` int NOT NULL DEFAULT 0 COMMENT '品质 0~4';

-- 新增字段
ALTER TABLE `equipment_inventory`
  ADD COLUMN `level` int NOT NULL DEFAULT 1 COMMENT '等级 1~8' AFTER `name`,
  ADD COLUMN `gear_score` int NOT NULL DEFAULT 0 COMMENT '装等(=等级+品质，可手动覆盖)' AFTER `quality`,
  ADD COLUMN `slot` varchar(20) NOT NULL DEFAULT '其他' COMMENT '部位: 武器/头/甲/鞋/副手/披风/坐骑/其他' AFTER `gear_score`,
  ADD COLUMN `location` varchar(50) NOT NULL DEFAULT '公会仓库' COMMENT '所在位置' AFTER `slot`,
  ADD COLUMN `image_url` varchar(500) DEFAULT NULL COMMENT '参考图URL' AFTER `location`;

-- 添加唯一索引（装备名称+等级+品质+部位 唯一标识一种装备）
ALTER TABLE `equipment_inventory`
  ADD UNIQUE KEY `uk_equipment_unique` (`name`, `level`, `quality`, `slot`);

-- 添加查询索引
ALTER TABLE `equipment_inventory`
  ADD INDEX `idx_equipment_name` (`name`),
  ADD INDEX `idx_equipment_slot` (`slot`),
  ADD INDEX `idx_equipment_gear_score` (`gear_score`);

-- 更新表注释
ALTER TABLE `equipment_inventory` COMMENT = '装备库存表（公会仓库模式）';

-- ============================================================
-- 3. resupply_requests 表：新增补装详情字段，修改状态语义
-- ============================================================

-- 新增 KOOK 申请人信息字段
ALTER TABLE `resupply_requests`
  ADD COLUMN `kook_user_id` varchar(50) DEFAULT NULL COMMENT '申请人KOOK ID' AFTER `member_id`,
  ADD COLUMN `kook_nickname` varchar(100) DEFAULT NULL COMMENT '申请人KOOK昵称' AFTER `kook_user_id`,
  ADD COLUMN `kook_roles` varchar(500) DEFAULT NULL COMMENT '申请人服务器角色' AFTER `kook_nickname`;

-- 新增装备详情字段
ALTER TABLE `resupply_requests`
  ADD COLUMN `level` int DEFAULT NULL COMMENT '装备等级 1~8' AFTER `equipment_name`,
  ADD COLUMN `quality` int DEFAULT NULL COMMENT '装备品质 0~4' AFTER `level`,
  ADD COLUMN `gear_score` int DEFAULT NULL COMMENT '装等' AFTER `quality`,
  ADD COLUMN `slot` varchar(20) DEFAULT NULL COMMENT '装备部位' AFTER `gear_score`,
  ADD COLUMN `apply_type` varchar(30) DEFAULT '补装' COMMENT '申请类型: 补装/OC碎/其他' AFTER `slot`;

-- 新增发放相关字段
ALTER TABLE `resupply_requests`
  ADD COLUMN `dispatched_by` int DEFAULT NULL COMMENT '发放人' AFTER `processed_at`,
  ADD COLUMN `dispatched_at` datetime DEFAULT NULL COMMENT '发放时间' AFTER `dispatched_by`,
  ADD COLUMN `dispatch_quantity` int DEFAULT NULL COMMENT '实际发放数量' AFTER `dispatched_at`;

-- 新增 KOOK 消息来源字段
ALTER TABLE `resupply_requests`
  ADD COLUMN `kook_message_id` varchar(100) DEFAULT NULL COMMENT 'KOOK消息ID（去重用）' AFTER `dispatch_quantity`;

-- 修改状态字段注释（语义变更：3从"已完成"改为"已发放"）
ALTER TABLE `resupply_requests` MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 0 COMMENT '状态 0待处理 1已通过 2已驳回 3已发放';

-- 添加索引
ALTER TABLE `resupply_requests`
  ADD INDEX `idx_resupply_kook_user` (`kook_user_id`),
  ADD UNIQUE INDEX `uk_kook_message` (`kook_message_id`);

-- ============================================================
-- 4. alert_rules 表：移除装备类型外键，改为多维度规则
-- ============================================================

-- 移除旧外键
ALTER TABLE `alert_rules` DROP FOREIGN KEY `fk_ar_type`;

-- 新增多维度字段
ALTER TABLE `alert_rules`
  ADD COLUMN `equipment_name` varchar(100) DEFAULT NULL COMMENT '装备名称（可选）' AFTER `rule_name`,
  ADD COLUMN `slot` varchar(20) DEFAULT NULL COMMENT '部位（可选）' AFTER `equipment_name`,
  ADD COLUMN `gear_score_min` int DEFAULT NULL COMMENT '装等下限（可选）' AFTER `slot`,
  ADD COLUMN `gear_score_max` int DEFAULT NULL COMMENT '装等上限（可选）' AFTER `gear_score_min`;

-- 条件类型固定为 below（库存低于阈值触发）
UPDATE `alert_rules` SET `condition_type` = 'below' WHERE `condition_type` != 'below';
ALTER TABLE `alert_rules` MODIFY COLUMN `condition_type` varchar(20) NOT NULL DEFAULT 'below' COMMENT '条件类型，固定为below';

-- 数据迁移：旧 equipment_type_id 暂保留但不再作为外键
-- 后续可根据 equipment_types.name 填充 equipment_name
ALTER TABLE `alert_rules` MODIFY COLUMN `equipment_type_id` int DEFAULT NULL COMMENT '旧装备类型ID（已废弃，保留兼容）';

-- ============================================================
-- 5. alert_records 表：放宽外键（rule 可能被删除）
-- ============================================================

ALTER TABLE `alert_records` DROP FOREIGN KEY `fk_arec_rule`;
ALTER TABLE `alert_records` MODIFY COLUMN `rule_id` int DEFAULT NULL COMMENT '关联规则（可为空）';

-- ============================================================
-- 6. kook_config 表：新增频道和角色配置项
-- ============================================================

INSERT IGNORE INTO `kook_config` (`config_key`, `config_value`, `description`) VALUES
  ('resupply_listen_channel_id', '', '补装申请监听频道 ID（成员在此频道发截图）'),
  ('admin_notify_channel_id', '', '管理员通知频道 ID（预警/系统消息推送）'),
  ('admin_role_id', '', '管理员角色 ID（@管理员用）'),
  ('last_resupply_message_id', '', '补装频道最后处理的消息 ID（增量拉取游标）');

-- ============================================================
-- 7. scheduled_tasks 表：更新定时任务时间
-- ============================================================

UPDATE `scheduled_tasks` SET `cron_expression` = '0 15 0 * * *', `task_name` = 'KOOK成员同步(0:15)' WHERE `task_name` LIKE '%成员同步%';
UPDATE `scheduled_tasks` SET `cron_expression` = '0 0 3 * * *', `task_name` = '库存预警刷新(3:00)' WHERE `task_name` LIKE '%预警刷新%';

-- 新增 KOOK 消息拉取任务
INSERT INTO `scheduled_tasks` (`task_name`, `cron_expression`, `status`) VALUES
  ('KOOK补装消息拉取(每5分钟)', '0 */5 * * * *', 1);

-- ============================================================
-- 8. 新增补装发放外键（dispatched_by → users）
-- ============================================================

ALTER TABLE `resupply_requests`
  ADD CONSTRAINT `fk_rs_dispatcher` FOREIGN KEY (`dispatched_by`) REFERENCES `users` (`id`);

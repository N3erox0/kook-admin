-- ============================================================
-- KOOK 装备管理后台 - V4 阶段一迁移脚本
-- 变更：邀请码表重构、装备图片表、OCR识别表、SSVIP角色、已统计字段
-- MySQL 8.0+ | 执行前请先备份数据库
-- ============================================================

USE kook_admin;

-- ============================================================
-- 1. 邀请码表重构（完全重建，按需求v3）
-- 状态：enabled启用 / used已使用 / disabled未启用 / revoked作废
-- 单次生效，一个邀请码对应一个公会创建
-- ============================================================

-- 先删除旧外键引用（guilds 表中的 invite_code_id）
-- 备份旧数据后重建
DROP TABLE IF EXISTS `invite_codes_backup`;
CREATE TABLE `invite_codes_backup` AS SELECT * FROM `invite_codes`;

DROP TABLE IF EXISTS `invite_codes`;

CREATE TABLE `invite_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '邀请码（唯一）',
  `status` varchar(10) NOT NULL DEFAULT 'disabled' COMMENT '状态: enabled启用 / used已使用 / disabled未启用 / revoked作废',
  `used_by_user_id` int DEFAULT NULL COMMENT '使用人ID',
  `bound_guild_id` int DEFAULT NULL COMMENT '绑定的公会ID（已使用后填入）',
  `bound_guild_name` varchar(100) DEFAULT NULL COMMENT '绑定的公会名称（冗余，列表展示用）',
  `used_at` datetime DEFAULT NULL COMMENT '使用时间',
  `created_by` int DEFAULT NULL COMMENT '创建人ID（SSVIP或admin）',
  `remark` varchar(200) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_code` (`code`),
  KEY `idx_invite_status` (`status`),
  KEY `idx_invite_created_by` (`created_by`),
  KEY `idx_invite_used_by` (`used_by_user_id`),
  KEY `idx_invite_bound_guild` (`bound_guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请码表（v4重构）';

-- ============================================================
-- 2. 装备图片表（独立存储，OCR模板匹配用）
-- ============================================================

CREATE TABLE IF NOT EXISTS `equipment_images` (
  `id` int NOT NULL AUTO_INCREMENT,
  `catalog_id` int NOT NULL COMMENT '关联装备参考库ID',
  `image_url` varchar(500) NOT NULL COMMENT '图片URL',
  `image_type` varchar(20) NOT NULL DEFAULT 'icon' COMMENT '图片类型: icon图标 / screenshot截图 / template模板',
  `file_name` varchar(200) DEFAULT NULL COMMENT '原始文件名',
  `file_size` int DEFAULT NULL COMMENT '文件大小(bytes)',
  `width` int DEFAULT NULL COMMENT '图片宽度(px)',
  `height` int DEFAULT NULL COMMENT '图片高度(px)',
  `is_primary` tinyint NOT NULL DEFAULT 0 COMMENT '是否主图（用于列表展示）',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ei_catalog` (`catalog_id`),
  KEY `idx_ei_type` (`image_type`),
  CONSTRAINT `fk_ei_catalog` FOREIGN KEY (`catalog_id`) REFERENCES `equipment_catalog` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='装备图片表';

-- ============================================================
-- 3. OCR 识别批次表
-- ============================================================

CREATE TABLE IF NOT EXISTS `ocr_recognition_batch` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `batch_no` varchar(64) NOT NULL COMMENT '批次号（唯一标识）',
  `image_url` varchar(500) NOT NULL COMMENT '上传的图片URL',
  `image_type` varchar(20) NOT NULL DEFAULT 'inventory' COMMENT '图片类型: inventory仓库截图 / kill击杀详情',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending待识别 / recognized已识别 / confirmed已确认 / saved已入库 / failed失败',
  `total_items` int NOT NULL DEFAULT 0 COMMENT '识别出的装备总数',
  `confirmed_items` int NOT NULL DEFAULT 0 COMMENT '已确认的装备数',
  `saved_items` int NOT NULL DEFAULT 0 COMMENT '已入库的装备数',
  `upload_user_id` int DEFAULT NULL COMMENT '上传人ID',
  `upload_user_name` varchar(50) DEFAULT NULL COMMENT '上传人名称',
  `error_message` varchar(500) DEFAULT NULL COMMENT '错误信息（失败时）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_batch_no` (`batch_no`),
  KEY `idx_orb_guild` (`guild_id`),
  KEY `idx_orb_status` (`status`),
  KEY `idx_orb_created` (`created_at`),
  CONSTRAINT `fk_orb_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OCR识别批次表';

-- ============================================================
-- 4. OCR 识别结果明细表
-- ============================================================

CREATE TABLE IF NOT EXISTS `ocr_recognition_item` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` int NOT NULL COMMENT '关联批次ID',
  `guild_id` int NOT NULL COMMENT '所属公会',
  `equipment_name` varchar(100) DEFAULT NULL COMMENT '识别出的装备名称',
  `matched_catalog_id` int DEFAULT NULL COMMENT '匹配到的参考库装备ID',
  `matched_catalog_name` varchar(100) DEFAULT NULL COMMENT '匹配到的参考库装备名称',
  `level` int DEFAULT NULL COMMENT '识别出的等级 1~8',
  `quality` int DEFAULT NULL COMMENT '识别出的品质 0~4',
  `category` varchar(20) DEFAULT NULL COMMENT '识别出的部位',
  `gear_score` int DEFAULT NULL COMMENT '识别出的装等',
  `quantity` int NOT NULL DEFAULT 1 COMMENT '识别出的数量',
  `confidence` decimal(5,2) DEFAULT NULL COMMENT '匹配置信度(0-100%)',
  `crop_image_url` varchar(500) DEFAULT NULL COMMENT '裁剪后的装备切图URL',
  `ocr_raw_text` text DEFAULT NULL COMMENT 'OCR原始识别文本',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending待确认 / confirmed已确认 / discarded已丢弃 / saved已入库',
  `confirmed_name` varchar(100) DEFAULT NULL COMMENT '人工确认后的装备名称',
  `confirmed_catalog_id` int DEFAULT NULL COMMENT '人工确认后的参考库ID',
  `confirmed_level` int DEFAULT NULL COMMENT '人工确认后的等级',
  `confirmed_quality` int DEFAULT NULL COMMENT '人工确认后的品质',
  `confirmed_quantity` int DEFAULT NULL COMMENT '人工确认后的数量',
  `position_x` int DEFAULT NULL COMMENT '在原图中的X坐标',
  `position_y` int DEFAULT NULL COMMENT '在原图中的Y坐标',
  `position_width` int DEFAULT NULL COMMENT '识别区域宽度',
  `position_height` int DEFAULT NULL COMMENT '识别区域高度',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ori_batch` (`batch_id`),
  KEY `idx_ori_guild` (`guild_id`),
  KEY `idx_ori_status` (`status`),
  KEY `idx_ori_catalog` (`matched_catalog_id`),
  CONSTRAINT `fk_ori_batch` FOREIGN KEY (`batch_id`) REFERENCES `ocr_recognition_batch` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ori_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='OCR识别结果明细表';

-- ============================================================
-- 5. guild_members 表：新增 SSVIP 角色支持
--    role 字段值域扩展: super_admin/ssvip/inventory_admin/resupply_staff/normal
-- ============================================================

-- role 字段已经是 varchar(20)，无需修改类型，只需更新注释
ALTER TABLE `guild_members` MODIFY COLUMN `role` varchar(20) NOT NULL DEFAULT 'normal' 
  COMMENT '管理角色: super_admin/ssvip/inventory_admin/resupply_staff/normal';

-- ============================================================
-- 6. users 表：新增全局角色字段（用于标识系统级SSVIP）
-- ============================================================

ALTER TABLE `users` ADD COLUMN `global_role` varchar(20) DEFAULT NULL 
  COMMENT '全局角色: ssvip（可查看所有公会和邀请码）' AFTER `kook_user_id`;

-- ============================================================
-- 7. guild_inventory 表：新增 is_counted 已统计字段
-- ============================================================

ALTER TABLE `guild_inventory` ADD COLUMN `is_counted` tinyint NOT NULL DEFAULT 0 
  COMMENT '是否已统计（预警推送后标记）' AFTER `remark`;

-- ============================================================
-- 8. guild_resupply 表：新增 is_counted 已统计字段
-- ============================================================

ALTER TABLE `guild_resupply` ADD COLUMN `is_counted` tinyint NOT NULL DEFAULT 0 
  COMMENT '是否已统计（预警推送后标记）' AFTER `kook_message_id`;

-- ============================================================
-- 9. guild_resupply 表：新增补装去重唯一标识字段
-- ============================================================

ALTER TABLE `guild_resupply` ADD COLUMN `dedup_hash` varchar(64) DEFAULT NULL 
  COMMENT '去重哈希（图片+日期+人员）' AFTER `is_counted`;
ALTER TABLE `guild_resupply` ADD UNIQUE KEY `uk_dedup_hash` (`guild_id`, `dedup_hash`);

-- ============================================================
-- 10. guild_alert_rules 表：新增 rule_type 字段
--     01=补装库存预警  02=死亡次数预警
-- ============================================================

ALTER TABLE `guild_alert_rules` ADD COLUMN `rule_type` varchar(2) NOT NULL DEFAULT '01' 
  COMMENT '规则类型: 01补装库存预警 / 02死亡次数预警' AFTER `guild_id`;
ALTER TABLE `guild_alert_rules` ADD COLUMN `gear_score` varchar(10) DEFAULT NULL 
  COMMENT '装等值（如P4-P8, P9, P12）' AFTER `equipment_name`;
ALTER TABLE `guild_alert_rules` ADD INDEX `idx_gar_rule_type` (`rule_type`);

-- ============================================================
-- 11. guilds 表：新增 Webhook 相关字段
-- ============================================================

ALTER TABLE `guilds` ADD COLUMN `kook_verify_token` varchar(100) DEFAULT NULL 
  COMMENT 'KOOK Verify Token' AFTER `kook_bot_token`;
ALTER TABLE `guilds` ADD COLUMN `kook_webhook_enabled` tinyint NOT NULL DEFAULT 0 
  COMMENT 'Webhook是否启用' AFTER `kook_verify_token`;

-- ============================================================
-- 12. guilds 表：新增频道选择字段（JSON数组存储已选频道ID）
-- ============================================================

ALTER TABLE `guilds` ADD COLUMN `kook_listen_channel_ids` json DEFAULT NULL 
  COMMENT '监听的频道ID列表(JSON数组)' AFTER `kook_admin_channel_id`;

-- ============================================================
-- 13. inventory_logs 表结构确认（已存在则跳过）
-- ============================================================

CREATE TABLE IF NOT EXISTS `inventory_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `inventory_id` int DEFAULT NULL COMMENT '关联库存记录ID',
  `catalog_id` int DEFAULT NULL COMMENT '关联装备参考库ID',
  `equipment_name` varchar(100) DEFAULT NULL COMMENT '装备名称',
  `action` varchar(30) NOT NULL COMMENT '操作类型: manual_add/manual_edit/csv_import/ocr_import/resupply_deduct/delete',
  `delta` int NOT NULL DEFAULT 0 COMMENT '变动量（正=增加，负=减少）',
  `before_quantity` int NOT NULL DEFAULT 0 COMMENT '变动前数量',
  `after_quantity` int NOT NULL DEFAULT 0 COMMENT '变动后数量',
  `operator_id` int DEFAULT NULL COMMENT '操作人ID',
  `operator_name` varchar(50) DEFAULT NULL COMMENT '操作人名称',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invlog_guild` (`guild_id`),
  KEY `idx_invlog_inventory` (`inventory_id`),
  KEY `idx_invlog_catalog` (`catalog_id`),
  KEY `idx_invlog_action` (`action`),
  KEY `idx_invlog_created` (`created_at`),
  CONSTRAINT `fk_invlog_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存变动日志表';

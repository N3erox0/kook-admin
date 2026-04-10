-- ============================================================
-- KOOK 装备管理后台 - V3 多公会架构完整 Schema
-- MySQL 8.0+ | utf8mb4 | 全新表结构
-- ============================================================

CREATE DATABASE IF NOT EXISTS kook_admin
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE kook_admin;

-- ============================================================
-- 1. 系统用户表（登录账号，关联 KOOK 身份）
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `nickname` varchar(50) DEFAULT NULL COMMENT '昵称',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `kook_user_id` varchar(50) DEFAULT NULL COMMENT 'KOOK用户ID（OAuth绑定）',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态 0禁用 1启用',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_kook_user_id` (`kook_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

-- ============================================================
-- 2. 邀请码表（控制公会创建权限）
-- ============================================================
CREATE TABLE IF NOT EXISTS `invite_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL COMMENT '邀请码（唯一）',
  `max_uses` int NOT NULL DEFAULT 1 COMMENT '最大使用次数',
  `used_count` int NOT NULL DEFAULT 0 COMMENT '已使用次数',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT '状态: active有效 / disabled已封禁',
  `used_by_user_id` int DEFAULT NULL COMMENT '使用人ID（单次码）',
  `used_at` datetime DEFAULT NULL COMMENT '使用时间',
  `expires_at` datetime DEFAULT NULL COMMENT '过期时间（NULL为永不过期）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_invite_code` (`code`),
  KEY `idx_invite_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='邀请码表';

-- ============================================================
-- 3. 公会表
-- ============================================================
CREATE TABLE IF NOT EXISTS `guilds` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(20) NOT NULL COMMENT '公会名称（全局唯一，2-20字符）',
  `icon_url` varchar(500) DEFAULT NULL COMMENT '公会图标URL',
  `kook_guild_id` varchar(50) NOT NULL COMMENT 'KOOK服务器ID（唯一绑定）',
  `kook_bot_token` varchar(255) DEFAULT NULL COMMENT 'KOOK Bot Token',
  `kook_resupply_channel_id` varchar(50) DEFAULT NULL COMMENT '补装申请监听频道ID',
  `kook_admin_channel_id` varchar(50) DEFAULT NULL COMMENT '管理员通知频道ID',
  `kook_admin_role_id` varchar(50) DEFAULT NULL COMMENT '管理员角色ID（@用）',
  `kook_last_message_id` varchar(100) DEFAULT NULL COMMENT '补装频道最后处理消息ID（增量游标）',
  `owner_user_id` int NOT NULL COMMENT '创建人/拥有者',
  `invite_code_id` int DEFAULT NULL COMMENT '使用的邀请码ID',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态 0禁用 1启用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_guild_name` (`name`),
  UNIQUE KEY `uk_kook_guild_id` (`kook_guild_id`),
  KEY `fk_guild_owner` (`owner_user_id`),
  CONSTRAINT `fk_guild_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会表';

-- ============================================================
-- 4. 全局装备参考库（所有公会共享）
-- ============================================================
CREATE TABLE IF NOT EXISTS `equipment_catalog` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL COMMENT '装备名称',
  `level` int NOT NULL DEFAULT 1 COMMENT '等级 1~8',
  `quality` int NOT NULL DEFAULT 0 COMMENT '品质 0~4',
  `category` varchar(20) NOT NULL DEFAULT '其他' COMMENT '部位: 武器/副手/头/甲/鞋/坐骑/披风/药水/食物/其他',
  `gear_score` int NOT NULL DEFAULT 0 COMMENT '装等(=等级+品质，可手动覆盖)',
  `image_url` varchar(500) DEFAULT NULL COMMENT '参考图URL',
  `description` varchar(500) DEFAULT NULL COMMENT '描述',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_catalog_unique` (`name`, `level`, `quality`, `category`),
  KEY `idx_catalog_name` (`name`),
  KEY `idx_catalog_category` (`category`),
  KEY `idx_catalog_gear_score` (`gear_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='全局装备参考库';

-- ============================================================
-- 5. 公会成员表（按公会隔离，含角色）
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `user_id` int DEFAULT NULL COMMENT '关联系统用户（可为空，纯KOOK成员未注册）',
  `kook_user_id` varchar(50) NOT NULL COMMENT 'KOOK用户ID',
  `nickname` varchar(100) DEFAULT NULL COMMENT '服务器昵称',
  `kook_roles` json DEFAULT NULL COMMENT 'KOOK服务器角色JSON',
  `role` varchar(20) NOT NULL DEFAULT 'normal' COMMENT '管理角色: super_admin/inventory_admin/resupply_staff/normal',
  `status` varchar(10) NOT NULL DEFAULT 'active' COMMENT '成员状态: active在会 / left已离开',
  `joined_at` datetime DEFAULT NULL COMMENT '加入公会时间',
  `left_at` datetime DEFAULT NULL COMMENT '离开时间',
  `last_synced_at` datetime DEFAULT NULL COMMENT '最后同步时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_guild_kook_user` (`guild_id`, `kook_user_id`),
  KEY `idx_gm_guild` (`guild_id`),
  KEY `idx_gm_status` (`status`),
  KEY `idx_gm_role` (`role`),
  KEY `idx_gm_joined` (`joined_at`),
  KEY `idx_gm_left` (`left_at`),
  CONSTRAINT `fk_gm_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会成员表';

-- ============================================================
-- 6. 公会库存表（公会拥有的装备数量）
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `catalog_id` int NOT NULL COMMENT '关联装备参考库',
  `quantity` int NOT NULL DEFAULT 0 COMMENT '数量',
  `location` varchar(50) NOT NULL DEFAULT '公会仓库' COMMENT '所在位置',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_guild_catalog` (`guild_id`, `catalog_id`),
  KEY `idx_gi_guild` (`guild_id`),
  KEY `idx_gi_catalog` (`catalog_id`),
  CONSTRAINT `fk_gi_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gi_catalog` FOREIGN KEY (`catalog_id`) REFERENCES `equipment_catalog` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会库存表';

-- ============================================================
-- 7. 公会补装申请表
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_resupply` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `guild_member_id` int DEFAULT NULL COMMENT '关联公会成员',
  `kook_user_id` varchar(50) DEFAULT NULL COMMENT '申请人KOOK ID',
  `kook_nickname` varchar(100) DEFAULT NULL COMMENT '申请人昵称',
  `equipment_name` varchar(100) NOT NULL COMMENT '装备名称',
  `level` int DEFAULT NULL COMMENT '等级 1~8',
  `quality` int DEFAULT NULL COMMENT '品质 0~4',
  `gear_score` int DEFAULT NULL COMMENT '装等',
  `category` varchar(20) DEFAULT NULL COMMENT '部位',
  `quantity` int NOT NULL DEFAULT 1 COMMENT '申请数量',
  `apply_type` varchar(30) NOT NULL DEFAULT '补装' COMMENT '申请类型: 补装/OC碎/其他',
  `reason` varchar(500) DEFAULT NULL COMMENT '备注/原因',
  `screenshot_url` varchar(500) DEFAULT NULL COMMENT '截图凭证URL',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '0待处理 1已通过 2已驳回 3已发放',
  `processed_by` int DEFAULT NULL COMMENT '处理人(通过/驳回)',
  `process_remark` varchar(500) DEFAULT NULL COMMENT '处理备注/驳回原因',
  `processed_at` datetime DEFAULT NULL COMMENT '处理时间',
  `dispatched_by` int DEFAULT NULL COMMENT '发放人',
  `dispatched_at` datetime DEFAULT NULL COMMENT '发放时间',
  `dispatch_quantity` int DEFAULT NULL COMMENT '实际发放数量',
  `kook_message_id` varchar(100) DEFAULT NULL COMMENT 'KOOK消息ID（去重）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kook_msg` (`guild_id`, `kook_message_id`),
  KEY `idx_gr_guild` (`guild_id`),
  KEY `idx_gr_status` (`status`),
  KEY `idx_gr_kook_user` (`kook_user_id`),
  KEY `idx_gr_created` (`created_at`),
  CONSTRAINT `fk_gr_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会补装申请表';

-- ============================================================
-- 8. 公会补装流转日志表
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_resupply_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `resupply_id` int NOT NULL COMMENT '关联补装申请',
  `action` varchar(50) NOT NULL COMMENT '操作: create/approve/reject/dispatch',
  `operator_id` int DEFAULT NULL COMMENT '操作人ID',
  `operator_name` varchar(50) DEFAULT NULL COMMENT '操作人名称',
  `from_status` varchar(20) DEFAULT NULL COMMENT '原状态',
  `to_status` varchar(20) DEFAULT NULL COMMENT '目标状态',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_grl_resupply` (`resupply_id`),
  KEY `idx_grl_guild` (`guild_id`),
  CONSTRAINT `fk_grl_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_grl_resupply` FOREIGN KEY (`resupply_id`) REFERENCES `guild_resupply` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会补装流转日志';

-- ============================================================
-- 9. 公会预警规则表（多维度）
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_alert_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `rule_name` varchar(100) NOT NULL COMMENT '规则名称',
  `equipment_name` varchar(100) DEFAULT NULL COMMENT '装备名称（可选）',
  `category` varchar(20) DEFAULT NULL COMMENT '部位（可选）',
  `gear_score_min` int DEFAULT NULL COMMENT '装等下限（可选）',
  `gear_score_max` int DEFAULT NULL COMMENT '装等上限（可选）',
  `threshold` int NOT NULL COMMENT '预警阈值（低于此值触发）',
  `enabled` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_by` int DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gar_guild` (`guild_id`),
  CONSTRAINT `fk_gar_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会预警规则表';

-- ============================================================
-- 10. 公会预警记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS `guild_alert_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '所属公会',
  `rule_id` int DEFAULT NULL COMMENT '关联规则',
  `alert_type` varchar(50) NOT NULL DEFAULT 'below' COMMENT '预警类型',
  `message` varchar(500) NOT NULL COMMENT '预警消息',
  `current_value` int NOT NULL COMMENT '当前值',
  `threshold_value` int NOT NULL COMMENT '阈值',
  `is_resolved` tinyint NOT NULL DEFAULT 0 COMMENT '是否已解决',
  `resolved_at` datetime DEFAULT NULL COMMENT '解决时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_garec_guild` (`guild_id`),
  KEY `idx_garec_resolved` (`is_resolved`),
  KEY `idx_garec_created` (`created_at`),
  CONSTRAINT `fk_garec_guild` FOREIGN KEY (`guild_id`) REFERENCES `guilds` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='公会预警记录表';

-- ============================================================
-- 11. 操作日志表（全局，含 guild_id）
-- ============================================================
CREATE TABLE IF NOT EXISTS `operation_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int DEFAULT NULL COMMENT '所属公会（全局操作为空）',
  `user_id` int DEFAULT NULL COMMENT '操作人',
  `username` varchar(50) DEFAULT NULL COMMENT '操作人名称',
  `module` varchar(50) NOT NULL COMMENT '模块',
  `action` varchar(50) NOT NULL COMMENT '操作类型',
  `target_type` varchar(50) DEFAULT NULL COMMENT '目标类型',
  `target_id` int DEFAULT NULL COMMENT '目标ID',
  `request_params` json DEFAULT NULL COMMENT '请求参数',
  `response_status` int DEFAULT NULL COMMENT '响应状态',
  `ip_address` varchar(50) DEFAULT NULL COMMENT 'IP地址',
  `user_agent` varchar(500) DEFAULT NULL COMMENT '浏览器UA',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_logs_guild` (`guild_id`),
  KEY `idx_logs_user` (`user_id`),
  KEY `idx_logs_module_action` (`module`, `action`),
  KEY `idx_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- ============================================================
-- 12. 定时任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_name` varchar(100) NOT NULL COMMENT '任务名称',
  `cron_expression` varchar(50) NOT NULL COMMENT 'CRON表达式',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态',
  `last_run_at` datetime DEFAULT NULL COMMENT '上次执行时间',
  `last_run_result` varchar(200) DEFAULT NULL COMMENT '上次执行结果',
  `duration_ms` int DEFAULT NULL COMMENT '执行耗时ms',
  `next_run_at` datetime DEFAULT NULL COMMENT '下次执行时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务表';

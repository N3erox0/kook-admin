-- KOOK 装备管理后台 - 数据库初始化脚本
-- MySQL 8.0+ | 字符集: utf8mb4

CREATE DATABASE IF NOT EXISTS kook_admin
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE kook_admin;

-- 1. 用户表
CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL COMMENT '登录账号',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `nickname` varchar(50) DEFAULT NULL COMMENT '昵称',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态 0禁用 1启用',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统用户表';

-- 2. 角色表
CREATE TABLE IF NOT EXISTS `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '角色标识',
  `display_name` varchar(50) NOT NULL COMMENT '角色名称',
  `description` varchar(200) DEFAULT NULL COMMENT '描述',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色表';

-- 3. 权限表
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `module` varchar(50) NOT NULL COMMENT '模块标识',
  `action` varchar(50) NOT NULL COMMENT '操作标识',
  `display_name` varchar(50) NOT NULL COMMENT '权限名称',
  `description` varchar(200) DEFAULT NULL COMMENT '描述',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_module_action` (`module`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限表';

-- 4. 用户-角色关联表
CREATE TABLE IF NOT EXISTS `user_roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `role_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`user_id`, `role_id`),
  KEY `fk_ur_user` (`user_id`),
  KEY `fk_ur_role` (`role_id`),
  CONSTRAINT `fk_ur_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户角色关联表';

-- 5. 角色-权限关联表
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
  KEY `fk_rp_role` (`role_id`),
  KEY `fk_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色权限关联表';

-- 6. KOOK 成员表
CREATE TABLE IF NOT EXISTS `members` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kook_user_id` varchar(50) NOT NULL COMMENT 'KOOK用户ID',
  `username` varchar(100) NOT NULL COMMENT 'KOOK用户名',
  `nickname` varchar(100) DEFAULT NULL COMMENT '服务器昵称',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `kook_roles` json DEFAULT NULL COMMENT 'KOOK角色JSON',
  `online_status` tinyint NOT NULL DEFAULT 0 COMMENT '在线状态',
  `sync_status` tinyint NOT NULL DEFAULT 1 COMMENT '同步状态',
  `last_synced_at` datetime DEFAULT NULL COMMENT '最后同步时间',
  `joined_at` datetime DEFAULT NULL COMMENT '加入时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_kook_user_id` (`kook_user_id`),
  KEY `idx_members_kook_user_id` (`kook_user_id`),
  KEY `idx_members_sync_status` (`sync_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KOOK成员表';

-- 7. 装备类型表
CREATE TABLE IF NOT EXISTS `equipment_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL COMMENT '装备类型名称',
  `code` varchar(30) NOT NULL COMMENT '类型编码',
  `icon` varchar(100) DEFAULT NULL COMMENT '图标',
  `sort_order` int NOT NULL DEFAULT 0 COMMENT '排序',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='装备类型表';

-- 8. 装备库存表
CREATE TABLE IF NOT EXISTS `equipment_inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int NOT NULL COMMENT '关联成员',
  `type_id` int NOT NULL COMMENT '装备类型',
  `name` varchar(100) NOT NULL COMMENT '装备名称',
  `quality` varchar(30) DEFAULT NULL COMMENT '品质/等级',
  `quantity` int NOT NULL DEFAULT 1 COMMENT '数量',
  `enhancement_level` int NOT NULL DEFAULT 0 COMMENT '强化等级',
  `screenshot_url` varchar(500) DEFAULT NULL COMMENT '截图URL',
  `ocr_verified` tinyint NOT NULL DEFAULT 0 COMMENT 'OCR已确认',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventory_member_type` (`member_id`, `type_id`),
  KEY `idx_inventory_type` (`type_id`),
  CONSTRAINT `fk_inv_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inv_type` FOREIGN KEY (`type_id`) REFERENCES `equipment_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='装备库存表';

-- 9. 补装申请表
CREATE TABLE IF NOT EXISTS `resupply_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `member_id` int NOT NULL COMMENT '申请成员',
  `equipment_name` varchar(100) NOT NULL COMMENT '装备名称',
  `equipment_type_id` int DEFAULT NULL COMMENT '装备类型',
  `quantity` int NOT NULL DEFAULT 1 COMMENT '申请数量',
  `reason` varchar(500) DEFAULT NULL COMMENT '申请原因',
  `screenshot_url` varchar(500) DEFAULT NULL COMMENT '截图凭证',
  `status` tinyint NOT NULL DEFAULT 0 COMMENT '状态 0待审批 1通过 2驳回 3完成',
  `processed_by` int DEFAULT NULL COMMENT '处理人',
  `process_remark` varchar(500) DEFAULT NULL COMMENT '处理备注',
  `processed_at` datetime DEFAULT NULL COMMENT '处理时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_resupply_status` (`status`),
  KEY `idx_resupply_member` (`member_id`),
  KEY `idx_resupply_created` (`created_at`),
  CONSTRAINT `fk_rs_member` FOREIGN KEY (`member_id`) REFERENCES `members` (`id`),
  CONSTRAINT `fk_rs_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='补装申请表';

-- 10. 补装流转日志表
CREATE TABLE IF NOT EXISTS `resupply_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL COMMENT '关联申请',
  `action` varchar(50) NOT NULL COMMENT '操作类型',
  `operator_id` int DEFAULT NULL COMMENT '操作人ID',
  `operator_name` varchar(50) DEFAULT NULL COMMENT '操作人名称',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `from_status` varchar(20) DEFAULT NULL COMMENT '原状态',
  `to_status` varchar(20) DEFAULT NULL COMMENT '目标状态',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_rl_request` (`request_id`),
  CONSTRAINT `fk_rl_request` FOREIGN KEY (`request_id`) REFERENCES `resupply_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='补装流转日志表';

-- 11. 预警规则表
CREATE TABLE IF NOT EXISTS `alert_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `equipment_type_id` int NOT NULL COMMENT '装备类型',
  `rule_name` varchar(100) NOT NULL COMMENT '规则名称',
  `condition_type` varchar(20) NOT NULL COMMENT '条件类型 below/above',
  `threshold` int NOT NULL COMMENT '阈值',
  `enabled` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用',
  `created_by` int DEFAULT NULL COMMENT '创建人',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ar_type` FOREIGN KEY (`equipment_type_id`) REFERENCES `equipment_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警规则表';

-- 12. 预警记录表
CREATE TABLE IF NOT EXISTS `alert_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `rule_id` int NOT NULL COMMENT '关联规则',
  `alert_type` varchar(50) NOT NULL COMMENT '预警类型',
  `message` varchar(500) NOT NULL COMMENT '预警消息',
  `current_value` int NOT NULL COMMENT '当前值',
  `threshold_value` int NOT NULL COMMENT '阈值',
  `is_resolved` tinyint NOT NULL DEFAULT 0 COMMENT '是否已解决',
  `resolved_at` datetime DEFAULT NULL COMMENT '解决时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_alert_resolved` (`is_resolved`),
  KEY `idx_alert_created` (`created_at`),
  CONSTRAINT `fk_arec_rule` FOREIGN KEY (`rule_id`) REFERENCES `alert_rules` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预警记录表';

-- 13. 操作日志表
CREATE TABLE IF NOT EXISTS `operation_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
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
  KEY `idx_logs_user` (`user_id`),
  KEY `idx_logs_module_action` (`module`, `action`),
  KEY `idx_logs_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 14. 定时任务表
CREATE TABLE IF NOT EXISTS `scheduled_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task_name` varchar(100) NOT NULL COMMENT '任务名称',
  `cron_expression` varchar(50) NOT NULL COMMENT 'CRON表达式',
  `status` tinyint NOT NULL DEFAULT 1 COMMENT '状态',
  `last_run_at` datetime DEFAULT NULL COMMENT '上次执行时间',
  `last_run_result` varchar(50) DEFAULT NULL COMMENT '上次执行结果',
  `duration_ms` int DEFAULT NULL COMMENT '执行耗时ms',
  `next_run_at` datetime DEFAULT NULL COMMENT '下次执行时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定时任务表';

-- 15. KOOK 配置表
CREATE TABLE IF NOT EXISTS `kook_config` (
  `id` int NOT NULL AUTO_INCREMENT,
  `config_key` varchar(100) NOT NULL COMMENT '配置键',
  `config_value` text DEFAULT NULL COMMENT '配置值',
  `description` varchar(200) DEFAULT NULL COMMENT '描述',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='KOOK配置表';

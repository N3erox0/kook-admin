-- ============================================================
-- KOOK 装备管理后台 - V5 迁移脚本
-- 变更：Guild 增加 activation_code/invited_by_kook_user_id 字段
--       Guild status 改为支持 0=pending 1=active 2=disabled
--       GuildMember 增加 join_source 字段
-- MySQL 8.0+ | 执行前请先备份数据库
-- ============================================================

USE kook_admin;

-- 1. guilds 表：增加 activation_code 字段（一次性激活码）
ALTER TABLE `guilds` ADD COLUMN `activation_code` varchar(64) DEFAULT NULL
  COMMENT '一次性激活码（joined_guild时生成）' AFTER `invite_code_id`;
ALTER TABLE `guilds` ADD UNIQUE KEY `uk_activation_code` (`activation_code`);

-- 2. guilds 表：增加 invited_by_kook_user_id 字段
ALTER TABLE `guilds` ADD COLUMN `invited_by_kook_user_id` varchar(50) DEFAULT NULL
  COMMENT '邀请人KOOK用户ID' AFTER `activation_code`;

-- 3. guilds 表：owner_user_id 改为允许 NULL（pending 状态时无 owner）
ALTER TABLE `guilds` MODIFY COLUMN `owner_user_id` int DEFAULT NULL
  COMMENT '创建人（激活后填入）';

-- 4. guilds 表：status 注释更新
ALTER TABLE `guilds` MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 0
  COMMENT '状态: 0=pending_activation 1=active 2=disabled';

-- 将已有公会的 status 保持为 1（active）
UPDATE `guilds` SET `status` = 1 WHERE `status` = 1;

-- 5. guild_members 表：增加 join_source 字段
ALTER TABLE `guild_members` ADD COLUMN `join_source` varchar(20) NOT NULL DEFAULT 'kook_sync'
  COMMENT '加入方式: kook_sync/invite_link/manual/webhook' AFTER `last_synced_at`;

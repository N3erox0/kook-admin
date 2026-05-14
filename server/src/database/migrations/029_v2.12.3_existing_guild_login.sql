-- ============================================================
-- V2.12.3 已有公会账号直登修复
-- 日期：2026-05-14
-- 说明：
-- 1. 新公会创建仍走邀请码流程；
-- 2. 已有公会账号只要绑定 users + guild_members，即可直接账号密码登录；
-- 3. 测试账号 test_user_999 绑定到 999/10087测试工会，角色 super_admin；
-- 4. 手动账号不绑定真实 KOOK，使用 local-* 本地占位ID避免唯一索引冲突。
-- ============================================================

USE kook_admin;

-- 1. 确保测试登录账号存在且密码哈希为指定测试值
INSERT INTO `users` (`username`, `password_hash`, `nickname`, `status`, `created_at`, `updated_at`)
VALUES ('test_user_999', '$2b$10$h3qTPhe4CxXrUgNUbDcR7.Ll4ntR5nT3ws3cz5KbEOfcOajcID3Cq', '测试用户_999', 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `id` = LAST_INSERT_ID(`id`),
  `password_hash` = VALUES(`password_hash`),
  `nickname` = VALUES(`nickname`),
  `status` = 1,
  `updated_at` = NOW();

SET @test_user_id := LAST_INSERT_ID();

-- 2. 确保 999 测试公会为启用状态，且 owner 指向测试账号
INSERT INTO `guilds` (`id`, `name`, `icon_url`, `kook_guild_id`, `kook_bot_token`, `owner_user_id`, `status`, `created_at`, `updated_at`)
VALUES (999, '10087测试工会', NULL, 'test-guild-999', '', @test_user_id, 1, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `owner_user_id` = @test_user_id,
  `status` = 1,
  `updated_at` = NOW();

-- 3. 确保 test_user_999 是 999 公会 super_admin，且不依赖真实 KOOK 绑定
SET @target_member_id := (
  SELECT `id` FROM `guild_members`
  WHERE `guild_id` = 999 AND (`user_id` = @test_user_id OR `kook_user_id` = 'local-test-user-999')
  ORDER BY CASE WHEN `user_id` = @test_user_id THEN 0 ELSE 1 END, `id`
  LIMIT 1
);

UPDATE `guild_members`
SET
  `user_id` = @test_user_id,
  `kook_user_id` = 'local-test-user-999',
  `nickname` = '测试管理员',
  `role` = 'super_admin',
  `status` = 'active',
  `left_at` = NULL,
  `last_synced_at` = NOW(),
  `join_source` = 'manual',
  `updated_at` = NOW()
WHERE `id` = @target_member_id;

INSERT INTO `guild_members` (`guild_id`, `user_id`, `kook_user_id`, `nickname`, `role`, `status`, `joined_at`, `last_synced_at`, `join_source`, `created_at`, `updated_at`)
SELECT 999, @test_user_id, 'local-test-user-999', '测试管理员', 'super_admin', 'active', NOW(), NOW(), 'manual', NOW(), NOW()
WHERE @target_member_id IS NULL;

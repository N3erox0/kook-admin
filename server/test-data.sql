-- ============================================
-- KOOK 装备管理后台 - 测试数据 SQL
-- 适用表：users + guild_members
-- 假设公会 ID = 999（默认开发公会）
-- ============================================

-- 1. 插入测试用户（如果不存在则忽略）
-- 密码统一为 123456 的 bcrypt 哈希
INSERT INTO `users` (`username`, `password_hash`, `nickname`, `status`) VALUES
('jam',     '$2a$10$xVqYLGEMCgKLGGmYiQ7HBOGhEEHpPBcYxRHEMZh1JlNGjBq7FYMTe', 'jam',     1),
('mrtena',  '$2a$10$xVqYLGEMCgKLGGmYiQ7HBOGhEEHpPBcYxRHEMZh1JlNGjBq7FYMTe', 'mrtena',  1),
('yesbabe', '$2a$10$xVqYLGEMCgKLGGmYiQ7HBOGhEEHpPBcYxRHEMZh1JlNGjBq7FYMTe', 'yesbabe', 1),
('neton',   '$2a$10$xVqYLGEMCgKLGGmYiQ7HBOGhEEHpPBcYxRHEMZh1JlNGjBq7FYMTe', 'neton',   1)
ON DUPLICATE KEY UPDATE `nickname` = VALUES(`nickname`);

-- 2. 获取用户 ID 并插入 guild_members
-- 先清空该公会的测试成员（可选，防止重复）
DELETE FROM `guild_members` WHERE `guild_id` = 999 AND `kook_user_id` IN ('KOOK_JAM', 'KOOK_MRTENA', 'KOOK_YESBABE', 'KOOK_NETON');

-- 3. 插入公会成员数据
INSERT INTO `guild_members` (`guild_id`, `user_id`, `kook_user_id`, `nickname`, `role`, `status`, `joined_at`, `last_synced_at`) VALUES
(999, (SELECT id FROM `users` WHERE username = 'jam'),     'KOOK_JAM',     'jam',     'super_admin',    'active', NOW(), NOW()),
(999, (SELECT id FROM `users` WHERE username = 'mrtena'),  'KOOK_MRTENA',  'mrtena',  'inventory_admin', 'active', NOW(), NOW()),
(999, (SELECT id FROM `users` WHERE username = 'yesbabe'), 'KOOK_YESBABE', 'yesbabe', 'resupply_staff',  'active', NOW(), NOW()),
(999, (SELECT id FROM `users` WHERE username = 'neton'),   'KOOK_NETON',   'neton',   'normal',          'active', NOW(), NOW());

-- ============================================
-- 验证查询
-- ============================================
SELECT
  gm.id,
  gm.nickname,
  gm.role,
  CASE gm.role
    WHEN 'super_admin'    THEN '服务器超级管理员'
    WHEN 'inventory_admin' THEN '库存管理员'
    WHEN 'resupply_staff'  THEN '补装管理员'
    WHEN 'normal'          THEN '普通成员'
    ELSE gm.role
  END AS role_label,
  gm.status,
  gm.joined_at
FROM `guild_members` gm
WHERE gm.guild_id = 999
ORDER BY FIELD(gm.role, 'super_admin', 'inventory_admin', 'resupply_staff', 'normal');

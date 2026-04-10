-- ============================================================
-- KOOK 装备管理后台 - 完整测试数据
-- 公会 ID=999 "天山明月"，主键使用 999/998/997 系列
-- 每个有状态字段的表，每种状态各一条数据
-- ============================================================

USE kook_admin;

-- ============================================================
-- 表1: users (status: 0=禁用, 1=启用)
-- ============================================================
INSERT INTO `users` (`id`, `username`, `password_hash`, `nickname`, `status`) VALUES
  (999, 'test_user_999', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '测试用户_启用', 1),
  (998, 'test_user_998', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', '测试用户_禁用', 0);

-- ============================================================
-- 表2: invite_codes (status: active / disabled)
-- ============================================================
INSERT INTO `invite_codes` (`id`, `code`, `max_uses`, `used_count`, `status`, `expires_at`) VALUES
  (999, 'TEST-CODE-999', 5, 0, 'active', DATE_ADD(NOW(), INTERVAL 90 DAY)),
  (998, 'TEST-CODE-998', 1, 1, 'disabled', DATE_ADD(NOW(), INTERVAL 90 DAY));

-- ============================================================
-- 表3: guilds (status: 0=禁用, 1=启用)
-- ============================================================
INSERT INTO `guilds` (`id`, `name`, `icon_url`, `kook_guild_id`, `kook_bot_token`, `owner_user_id`, `status`) VALUES
  (999, '天山明月', NULL, 'test-guild-999', 'test-bot-token-999', 1, 1),
  (998, '测试禁用公会', NULL, 'test-guild-998', 'test-bot-token-998', 1, 0);

-- ============================================================
-- 表4: equipment_catalog (无状态字段，插入测试参考装备)
-- ============================================================
INSERT INTO `equipment_catalog` (`id`, `name`, `level`, `quality`, `category`, `gear_score`, `description`) VALUES
  (999, '测试神剑', 8, 4, '武器', 12, '测试数据 - 最高等级武器'),
  (998, '测试圣盾', 8, 4, '副手', 12, '测试数据 - 最高等级副手'),
  (997, '测试龙铠', 8, 4, '甲', 12, '测试数据 - 最高等级甲胄');

-- ============================================================
-- 表5: guild_members (status: active / left; role: super_admin / inventory_admin / resupply_staff / normal)
-- ============================================================
INSERT INTO `guild_members` (`id`, `guild_id`, `user_id`, `kook_user_id`, `nickname`, `role`, `status`, `joined_at`, `left_at`) VALUES
  (999, 999, 999, 'kook-test-999', '测试管理员', 'super_admin', 'active', NOW(), NULL),
  (998, 999, NULL, 'kook-test-998', '测试库存员', 'inventory_admin', 'active', NOW(), NULL),
  (997, 999, NULL, 'kook-test-997', '测试补装员', 'resupply_staff', 'active', NOW(), NULL),
  (996, 999, NULL, 'kook-test-996', '测试普通成员', 'normal', 'active', NOW(), NULL),
  (995, 999, NULL, 'kook-test-995', '测试离会成员', 'normal', 'left', DATE_SUB(NOW(), INTERVAL 30 DAY), NOW());

-- ============================================================
-- 表6: guild_inventory (无状态字段)
-- ============================================================
INSERT INTO `guild_inventory` (`id`, `guild_id`, `catalog_id`, `quantity`, `location`, `remark`) VALUES
  (999, 999, 999, 50, '公会仓库', '测试神剑 - 库存充足'),
  (998, 999, 998, 8,  '公会仓库', '测试圣盾 - 库存较少'),
  (997, 999, 997, 3,  '前线营地', '测试龙铠 - 库存告急');

-- ============================================================
-- 表7: guild_resupply (status: 0=待处理, 1=已通过, 2=已驳回, 3=已发放)
-- ============================================================
INSERT INTO `guild_resupply` (`id`, `guild_id`, `guild_member_id`, `kook_user_id`, `kook_nickname`, `equipment_name`, `level`, `quality`, `category`, `quantity`, `apply_type`, `reason`, `status`, `processed_by`, `process_remark`, `processed_at`, `dispatched_by`, `dispatched_at`, `dispatch_quantity`, `created_at`) VALUES
  (999, 999, 996, 'kook-test-996', '测试普通成员', '测试神剑', 8, 4, '武器', 2, '补装', '副本掉落不够，申请补充', 0, NULL, NULL, NULL, NULL, NULL, NULL, NOW()),
  (998, 999, 996, 'kook-test-996', '测试普通成员', '测试圣盾', 8, 4, '副手', 1, '补装', '盾牌损坏需要更换', 1, 1, '审核通过，安排发放', NOW(), NULL, NULL, NULL, NOW()),
  (997, 999, 995, 'kook-test-995', '测试离会成员', '测试龙铠', 8, 4, '甲', 1, '补装', '甲胄磨损严重', 2, 1, '库存不足，暂缓发放', NOW(), NULL, NULL, NULL, NOW()),
  (996, 999, 996, 'kook-test-996', '测试普通成员', '测试神剑', 8, 4, '武器', 1, '补装', '已发放完成的申请', 3, 1, '审核通过', DATE_SUB(NOW(), INTERVAL 1 DAY), 1, NOW(), 1, DATE_SUB(NOW(), INTERVAL 2 DAY));

-- ============================================================
-- 表8: guild_resupply_logs (action: create/approve/reject/dispatch)
-- ============================================================
INSERT INTO `guild_resupply_logs` (`id`, `guild_id`, `resupply_id`, `action`, `operator_id`, `operator_name`, `from_status`, `to_status`, `remark`) VALUES
  (999, 999, 999, 'create',   NULL, '测试普通成员', NULL, '待处理', '提交补装申请'),
  (998, 999, 998, 'approve',  1, '测试管理员', '待处理', '已通过', '审核通过，安排发放'),
  (997, 999, 997, 'reject',   1, '测试管理员', '待处理', '已驳回', '库存不足，暂缓发放'),
  (996, 999, 996, 'dispatch', 1, '测试管理员', '已通过', '已发放', '已完成发放1件测试神剑');

-- ============================================================
-- 表9: guild_alert_rules (enabled: 0=禁用, 1=启用)
-- ============================================================
INSERT INTO `guild_alert_rules` (`id`, `guild_id`, `rule_name`, `equipment_name`, `category`, `gear_score_min`, `gear_score_max`, `threshold`, `enabled`, `created_by`) VALUES
  (999, 999, '测试预警_武器库存不足', NULL, '武器', NULL, NULL, 10, 1, 1),
  (998, 999, '测试预警_龙铠告急', '测试龙铠', '甲', 10, 12, 5, 1, 1),
  (997, 999, '测试预警_已禁用规则', NULL, '药水', NULL, NULL, 20, 0, 1);

-- ============================================================
-- 表10: guild_alert_records (is_resolved: 0=未解决, 1=已解决)
-- ============================================================
INSERT INTO `guild_alert_records` (`id`, `guild_id`, `rule_id`, `alert_type`, `message`, `current_value`, `threshold_value`, `is_resolved`, `resolved_at`) VALUES
  (999, 999, 999, 'below', '测试预警：武器库存8件，低于阈值10', 8, 10, 0, NULL),
  (998, 999, 998, 'below', '测试预警：龙铠库存3件，低于阈值5', 3, 5, 0, NULL),
  (997, 999, 997, 'below', '测试预警（已解决）：药水库存已补充至30', 30, 20, 1, NOW());

-- ============================================================
-- 表11: operation_logs (无状态字段，覆盖不同模块操作)
-- ============================================================
INSERT INTO `operation_logs` (`id`, `guild_id`, `user_id`, `username`, `module`, `action`, `target_type`, `target_id`, `ip_address`) VALUES
  (999, 999, 1, 'admin', 'inventory', 'create', 'guild_inventory', 999, '127.0.0.1'),
  (998, 999, 1, 'admin', 'resupply', 'approve', 'guild_resupply', 998, '127.0.0.1'),
  (997, 999, 1, 'admin', 'resupply', 'reject', 'guild_resupply', 997, '127.0.0.1'),
  (996, 999, 1, 'admin', 'resupply', 'dispatch', 'guild_resupply', 996, '127.0.0.1'),
  (995, 999, 1, 'admin', 'alert', 'create', 'guild_alert_rules', 999, '127.0.0.1'),
  (994, NULL, 1, 'admin', 'system', 'login', 'users', 1, '127.0.0.1');

-- ============================================================
-- 表12: scheduled_tasks (status: 0=禁用, 1=启用)
-- ============================================================
INSERT INTO `scheduled_tasks` (`id`, `task_name`, `cron_expression`, `status`, `last_run_at`, `last_run_result`, `duration_ms`) VALUES
  (999, '测试任务_启用', '0 0 * * * *', 1, NOW(), 'success', 120),
  (998, '测试任务_禁用', '0 30 * * * *', 0, NULL, NULL, NULL);

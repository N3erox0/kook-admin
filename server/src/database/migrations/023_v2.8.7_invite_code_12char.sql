-- V2.8.7: 邀请码系统升级
-- 1) 邀请码 12 位，字符集去 I/O/i/o（58 字符）
-- 2) 清空"未绑定公会的邀请码"（保留 status='used' 且 bound_guild_id IS NOT NULL 的）
-- 3) 清空所有 bot_join_records（便于重新触发 Bot 入群事件生成新邀请码）
-- 4) 重置测试公会状态（便于端到端测试）
-- 注意：已绑定公会的激活码（guild.activation_code）保留不动

-- ===== 备份现有数据（保险起见） =====
CREATE TABLE IF NOT EXISTS invite_codes_backup_v287 AS SELECT * FROM invite_codes;
CREATE TABLE IF NOT EXISTS bot_join_records_backup_v287 AS SELECT * FROM bot_join_records;

-- ===== 字段说明 =====
-- invite_codes.code 仍为 varchar(32)，容纳 12 位邀请码足够
-- 不修改字段长度

-- ===== 清空未绑定公会的邀请码 =====
-- 保留：status='used' 且 bound_guild_id IS NOT NULL（已使用且已绑定公会）
-- 删除：其他所有邀请码（enabled/disabled/revoked/ 未绑定公会的 used）

-- Step 1: 先解除 guilds.invite_code_id 对将被删除邀请码的引用
UPDATE guilds
   SET invite_code_id = NULL
 WHERE invite_code_id IS NOT NULL
   AND invite_code_id IN (
       SELECT id FROM (
           SELECT id FROM invite_codes
            WHERE NOT (status = 'used' AND bound_guild_id IS NOT NULL)
       ) AS t
   );

-- Step 2: 清空 bot_join_records（否则残留的 invite_code_id 会成孤儿）
DELETE FROM bot_join_records;

-- Step 3: 删除未绑定公会的邀请码
DELETE FROM invite_codes
 WHERE NOT (status = 'used' AND bound_guild_id IS NOT NULL);

-- ===== 重置测试服务器公会（便于端到端测试 Bot 入群） =====
-- 测试服务器 KOOK guild_id = 9753937142035542
-- 注意：正式服务器 1039645182090576 不在此清理范围，保留绑定关系
DELETE FROM guilds WHERE kook_guild_id = '9753937142035542';

-- ===== 验证（执行后查看结果） =====
-- SELECT id, code, status, bound_guild_id, bound_guild_name, used_at FROM invite_codes;
-- SELECT id, name, kook_guild_id, status, invite_code_id, activation_code FROM guilds;
-- SELECT id, guild_id, status, invite_code_id FROM bot_join_records;

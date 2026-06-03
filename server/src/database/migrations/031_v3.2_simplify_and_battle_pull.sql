-- V3.2: 简化与战报增量拉取改造
-- 本迁移为安全幂等脚本，仅做"约束确认"，不改变现有数据
-- 改动主要在代码层：
--   1) 战报拉取改为增量分页 + INSERT IGNORE 去重（依赖 albion_event_id 唯一索引）
--   2) Cron 时区固定为 Asia/Shanghai
--   3) 新增登录账号管理（/api/guild/:guildId/accounts），通过 guild_members.join_source='manual' 标记手动账号

-- ============================================================
-- 1. 校验 battle_reports.albion_event_id 唯一索引存在（V3.2 INSERT IGNORE 依赖）
-- ============================================================
-- 原 entity 已声明 @Index(['albionEventId'], { unique: true })，此处仅做幂等校验
-- 若历史库缺失，下面命令可手动确认/补建（首次执行可能报"Duplicate key name"，可忽略）
-- ALTER TABLE battle_reports ADD UNIQUE INDEX uq_battle_reports_event_id (albion_event_id);

-- ============================================================
-- 2. 校验 guild_members.join_source 字段已支持 'manual'
-- ============================================================
-- 现有 join_source 字段类型为 VARCHAR(20)，已能存 'manual'，无需变更
-- 仅确认默认值
SELECT
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'guild_members'
  AND COLUMN_NAME = 'join_source';

-- ============================================================
-- 3. 可选：清理 V3.0~V3.1 期间 INSERT IGNORE 之前因 SELECT-then-INSERT 并发产生的损坏数据
-- ============================================================
-- 若 PM2 日志中出现过大量 "Duplicate entry ... for key 'battle_reports.IDX_battle_reports_event_id'"
-- 通常说明并发写入被唯一索引兜底（数据本身正常），不需要清理
-- 若需要重建索引以确保一致性（耗时操作，仅大量重复时执行）：
-- ALTER TABLE battle_reports DROP INDEX IDX_battle_reports_event_id, ADD UNIQUE INDEX uq_battle_reports_event_id (albion_event_id);

-- ============================================================
-- 4. V3.2 不新增任何字段或表
-- ============================================================
-- accounts 模块完全复用 users + guild_members 双表，零侵入
-- 战报装备的 gearScore + category 写入 battle_reports.equipment_list JSON 内

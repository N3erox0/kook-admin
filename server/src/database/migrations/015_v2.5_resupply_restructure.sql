-- V2.5 补装系统重构
-- 1. 清空旧数据（用户确认清空重来）
TRUNCATE TABLE guild_resupply;
DELETE FROM guild_resupply_logs WHERE 1=1;

-- 2. 重构补装表字段
ALTER TABLE guild_resupply
  DROP COLUMN IF EXISTS level,
  DROP COLUMN IF EXISTS quality,
  DROP COLUMN IF EXISTS gear_score,
  DROP COLUMN IF EXISTS category;

ALTER TABLE guild_resupply
  CHANGE COLUMN equipment_name equipment_ids VARCHAR(500) NULL COMMENT '待补装备ID列表（逗号分隔的catalog ID）';

ALTER TABLE guild_resupply
  MODIFY COLUMN quantity INT DEFAULT 0 COMMENT '待补装备总数量';

-- 3. OCR batch 增加来源字段（待识别工作区）
ALTER TABLE ocr_recognition_batches
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual' COMMENT '来源: manual/kook' AFTER status,
  ADD COLUMN IF NOT EXISTS kook_user_id VARCHAR(50) NULL COMMENT 'KOOK推送用户ID' AFTER source,
  ADD COLUMN IF NOT EXISTS kook_nickname VARCHAR(100) NULL COMMENT 'KOOK推送用户昵称' AFTER kook_user_id;

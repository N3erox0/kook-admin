-- V2.3 补装申请OCR识别优化 — 独立字段拆分
-- 执行: mysql -u root kook_admin < /opt/kook-admin/server/src/database/migrations/010_v2.3_resupply_ocr_fields.sql

ALTER TABLE `guild_resupply`
  ADD COLUMN `kill_date` VARCHAR(10) NULL COMMENT '击杀日期 YYYY-MM-DD' AFTER `resupply_room`,
  ADD COLUMN `map_name` VARCHAR(50) NULL COMMENT '地图名称' AFTER `kill_date`,
  ADD COLUMN `game_id` VARCHAR(50) NULL COMMENT '游戏ID' AFTER `map_name`,
  ADD COLUMN `guild_name` VARCHAR(50) NULL COMMENT '公会名（OCR识别）' AFTER `game_id`;

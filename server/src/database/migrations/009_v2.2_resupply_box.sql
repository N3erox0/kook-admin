-- V2.2: 补装箱子编号 + 补装房间字段
-- guild_resupply 表新增字段
ALTER TABLE guild_resupply ADD COLUMN resupply_box VARCHAR(30) NULL COMMENT '补装箱子编号（如 3-16, 大厅32）' AFTER dedup_hash;
ALTER TABLE guild_resupply ADD COLUMN resupply_room VARCHAR(20) NULL COMMENT '补装房间（如 1-14, 大厅一, 大厅二）' AFTER resupply_box;

-- guilds 表新增补装房间配置
ALTER TABLE guilds ADD COLUMN resupply_rooms JSON NULL COMMENT '补装房间列表' AFTER kook_last_message_id;

-- 为新公会预置默认房间列表
UPDATE guilds SET resupply_rooms = '["1","2","3","4","5","6","7","8","9","10","11","12","13","14","大厅一","大厅二"]' WHERE resupply_rooms IS NULL AND status = 1;

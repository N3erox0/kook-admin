-- V2.4: operation_logs 新增 guild_id 字段
ALTER TABLE operation_logs ADD COLUMN guild_id INT NULL COMMENT '公会ID（SSVIP操作为NULL）' AFTER id;
CREATE INDEX idx_logs_guild ON operation_logs(guild_id);

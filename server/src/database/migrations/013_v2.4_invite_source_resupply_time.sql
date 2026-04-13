-- V2.4: invite_codes 新增 create_source 字段
ALTER TABLE invite_codes ADD COLUMN create_source VARCHAR(10) DEFAULT '01' COMMENT '创建途径: 01系统手动 02BOT自动' AFTER created_by;

-- V2.4: guild_resupply 新增 kook_message_time 字段
ALTER TABLE guild_resupply ADD COLUMN kook_message_time DATETIME NULL COMMENT 'KOOK消息推送时间' AFTER guild_name;

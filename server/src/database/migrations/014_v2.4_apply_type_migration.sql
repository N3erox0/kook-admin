-- V2.4: 更新 applyType 枚举值（兼容旧数据）
UPDATE guild_resupply SET apply_type = '死亡补装' WHERE apply_type = '补装';
UPDATE guild_resupply SET apply_type = 'REOC' WHERE apply_type = 'OC碎';
UPDATE guild_resupply SET apply_type = '手动创建' WHERE apply_type = '其他' AND kook_message_id IS NULL;

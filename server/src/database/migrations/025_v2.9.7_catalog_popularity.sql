-- V2.9.7: 装备参考库新增热度字段
-- 热度等级: 1=默认, 2=补装>1次, 3=扣减>100次, 4=扣减>1000次, 5=扣减>10000次
ALTER TABLE `equipment_catalog` ADD COLUMN `popularity` INT NOT NULL DEFAULT 1 COMMENT '装备热度 1~5（基于库存扣减频率）' AFTER `description`;

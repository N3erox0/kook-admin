-- V2.7.2 迁移: 装备参考库新增别称字段
-- 执行时间: 2026-04-15

ALTER TABLE equipment_catalog ADD COLUMN aliases VARCHAR(500) NULL COMMENT '装备别称（逗号分隔）' AFTER image_phash;

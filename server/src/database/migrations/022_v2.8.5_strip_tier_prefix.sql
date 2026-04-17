-- V2.8.5: 批量去除装备参考库中文等级前缀
-- 禅师级/宗师级/大师级/专家级/老手级/熟练级/学徒级/新手级

UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '禅师级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '宗师级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '大师级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '专家级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '老手级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '熟练级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '学徒级%';
UPDATE equipment_catalog SET name = SUBSTRING(name, 4) WHERE name LIKE '新手级%';

-- 去掉唯一索引中的重复（可能去前缀后出现重复，跳过报错）
-- 如果出现 Duplicate entry，手动处理

-- 同时更新 FRONTEND_URL 到 .env.example
-- FRONTEND_URL=http://22bngm.online

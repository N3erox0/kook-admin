-- V2.9.8: 清理 aliases 字段中的乱码数据（UTF-8 被 Latin-1 解码产生的乱码）
-- 特征：包含 Ã/Â/Å/Æ/È 等 Latin-1 高位字符
-- 执行时间: 2026-04-27

-- 清理乱码 aliases 为 NULL
UPDATE equipment_catalog
SET aliases = NULL
WHERE aliases IS NOT NULL
  AND (aliases LIKE '%Ã%' OR aliases LIKE '%Â%' OR aliases LIKE '%Å%'
    OR aliases LIKE '%Æ%' OR aliases LIKE '%È%' OR aliases LIKE '%Ä%');

-- 清理只包含空白的 aliases
UPDATE equipment_catalog
SET aliases = NULL
WHERE aliases IS NOT NULL AND TRIM(aliases) = '';

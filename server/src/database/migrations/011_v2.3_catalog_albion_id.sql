-- V2.3 装备参考库新增 albion_id 字段（Albion Online UniqueName 关联）
-- 执行: mysql -u root kook_admin < /opt/kook-admin/server/src/database/migrations/011_v2.3_catalog_albion_id.sql

ALTER TABLE `equipment_catalog`
  ADD COLUMN `albion_id` VARCHAR(100) NULL COMMENT 'Albion Online UniqueName（如T4_2H_CLAYMORE@2）' AFTER `name`,
  ADD UNIQUE INDEX `idx_catalog_albion_id` (`albion_id`);

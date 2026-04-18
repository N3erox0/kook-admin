-- ============================================================
-- V2.9.0 Batch 1 数据库迁移（占位文件）
-- 日期：2026-04-19
-- 说明：本批次无表结构变更，功能基于现有表实现
--   F-100: 公会图标 → 复用 guilds.icon_url
--   F-101: 成员搜索增强 → 复用 guild_members.kook_roles(JSON)
--   F-103: 补装数量 → 复用 guild_resupply.equipment_ids (以重复ID表示多份)
--   F-105: JWT refresh → 代码层补齐，无表变更
--   F-107: 路由整合 → 前端改动
--   F-108: 识别失败入待处理 → 复用 ocr_recognition_batch(source='kook')
--           + guild_resupply(status=2 rejected for 批量废弃)
--           + guild_resupply(status=3 dispatched for 快捷完成)
--   F-109: 放大显示 → 前端改动
-- ============================================================

SELECT 'V2.9.0 Batch 1 - No schema changes, placeholder only' AS message;

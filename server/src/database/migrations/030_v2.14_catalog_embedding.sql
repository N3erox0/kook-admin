-- V2.14: 为装备参考库添加 AI 特征向量字段
-- 存储 @xenova/transformers ViT 模型提取的 768 维特征向量（JSON 数组格式）
ALTER TABLE equipment_catalog ADD COLUMN image_embedding TEXT NULL COMMENT 'AI特征向量(768维float数组JSON)';

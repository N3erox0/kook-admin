-- V2.7.1: 装备参考库新增图片感知哈希字段
ALTER TABLE equipment_catalog ADD COLUMN image_phash VARCHAR(16) NULL COMMENT '图片感知哈希(pHash 64bit hex)' AFTER image_url;
CREATE INDEX idx_catalog_phash ON equipment_catalog(image_phash);

-- 清除披风类别中含"徽章"的装备
DELETE FROM equipment_catalog WHERE category = '披风' AND (name LIKE '%徽章%' OR albion_id LIKE '%CREST%');

-- V2.9.8: 新增热门装备游戏截图路径字段
-- pHash生成优先级: hotImagePath > localImagePath > imageUrl
ALTER TABLE equipment_catalog ADD COLUMN hot_image_path VARCHAR(500) NULL COMMENT '热门装备游戏截图路径' AFTER local_image_path;

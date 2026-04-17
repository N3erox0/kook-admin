-- V2.8.2: 装备参考库新增本地图片路径字段
-- 用于存储从 Albion 渲染服务器下载到本地的图片路径
-- pHash 生成优先读本地文件，提升效率和可靠性

ALTER TABLE equipment_catalog
  ADD COLUMN local_image_path VARCHAR(500) NULL COMMENT '本地图片路径' AFTER image_phash;

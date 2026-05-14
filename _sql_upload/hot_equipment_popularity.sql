-- ============================================================
-- 热门装备库入库 SQL：设置 popularity=5
-- 同时修复血刃分类 + 补充水晶火把
-- 生成时间：2026/5/14 22:23:09
-- ============================================================

-- 0. 修复血刃分类错误（食物 -> 武器）
UPDATE equipment_catalog SET category='武器' WHERE name='血刃' AND category='食物';

-- 1. 设置 popularity=5（热门装备库）
UPDATE equipment_catalog SET popularity=5
  WHERE name='无尽之剑' AND ((level=4 AND quality=4) OR (level=5 AND quality=3) OR (level=6 AND quality=2) OR (level=7 AND quality=1) OR (level=8 AND quality=0) OR (level=5 AND quality=4) OR (level=6 AND quality=3) OR (level=7 AND quality=2) OR (level=8 AND quality=1) OR (level=6 AND quality=4) OR (level=7 AND quality=3) OR (level=8 AND quality=2) OR (level=7 AND quality=4) OR (level=8 AND quality=3));
UPDATE equipment_catalog SET popularity=5
  WHERE name='恐惧风暴君主' AND ((level=7 AND quality=0) OR (level=8 AND quality=0) OR (level=8 AND quality=1));
UPDATE equipment_catalog SET popularity=5
  WHERE name='霆威战锤' AND ((level=7 AND quality=0) OR (level=8 AND quality=0) OR (level=8 AND quality=1));
UPDATE equipment_catalog SET popularity=5
  WHERE name='水晶刺刀' AND ((level=4 AND quality=4) OR (level=5 AND quality=3) OR (level=6 AND quality=2) OR (level=7 AND quality=1) OR (level=8 AND quality=0) OR (level=5 AND quality=4) OR (level=6 AND quality=3) OR (level=7 AND quality=2) OR (level=8 AND quality=1));

-- 2. 水晶火把补录（T4-T8 × Q0-Q4）
INSERT IGNORE INTO equipment_catalog (name, albion_id, level, quality, category, gear_score, image_url, description) VALUES
('水晶火把','T4_OFF_TORCH_CRYSTAL',4,0,'副手',4,'https://render.albiononline.com/v1/item/T4_OFF_TORCH_CRYSTAL.png?size=217','Crystal Torch'),
('水晶火把','T4_OFF_TORCH_CRYSTAL@1',4,1,'副手',5,'https://render.albiononline.com/v1/item/T4_OFF_TORCH_CRYSTAL@1.png?size=217','Crystal Torch'),
('水晶火把','T4_OFF_TORCH_CRYSTAL@2',4,2,'副手',6,'https://render.albiononline.com/v1/item/T4_OFF_TORCH_CRYSTAL@2.png?size=217','Crystal Torch'),
('水晶火把','T4_OFF_TORCH_CRYSTAL@3',4,3,'副手',7,'https://render.albiononline.com/v1/item/T4_OFF_TORCH_CRYSTAL@3.png?size=217','Crystal Torch'),
('水晶火把','T4_OFF_TORCH_CRYSTAL@4',4,4,'副手',8,'https://render.albiononline.com/v1/item/T4_OFF_TORCH_CRYSTAL@4.png?size=217','Crystal Torch'),
('水晶火把','T5_OFF_TORCH_CRYSTAL',5,0,'副手',5,'https://render.albiononline.com/v1/item/T5_OFF_TORCH_CRYSTAL.png?size=217','Crystal Torch'),
('水晶火把','T5_OFF_TORCH_CRYSTAL@1',5,1,'副手',6,'https://render.albiononline.com/v1/item/T5_OFF_TORCH_CRYSTAL@1.png?size=217','Crystal Torch'),
('水晶火把','T5_OFF_TORCH_CRYSTAL@2',5,2,'副手',7,'https://render.albiononline.com/v1/item/T5_OFF_TORCH_CRYSTAL@2.png?size=217','Crystal Torch'),
('水晶火把','T5_OFF_TORCH_CRYSTAL@3',5,3,'副手',8,'https://render.albiononline.com/v1/item/T5_OFF_TORCH_CRYSTAL@3.png?size=217','Crystal Torch'),
('水晶火把','T5_OFF_TORCH_CRYSTAL@4',5,4,'副手',9,'https://render.albiononline.com/v1/item/T5_OFF_TORCH_CRYSTAL@4.png?size=217','Crystal Torch'),
('水晶火把','T6_OFF_TORCH_CRYSTAL',6,0,'副手',6,'https://render.albiononline.com/v1/item/T6_OFF_TORCH_CRYSTAL.png?size=217','Crystal Torch'),
('水晶火把','T6_OFF_TORCH_CRYSTAL@1',6,1,'副手',7,'https://render.albiononline.com/v1/item/T6_OFF_TORCH_CRYSTAL@1.png?size=217','Crystal Torch'),
('水晶火把','T6_OFF_TORCH_CRYSTAL@2',6,2,'副手',8,'https://render.albiononline.com/v1/item/T6_OFF_TORCH_CRYSTAL@2.png?size=217','Crystal Torch'),
('水晶火把','T6_OFF_TORCH_CRYSTAL@3',6,3,'副手',9,'https://render.albiononline.com/v1/item/T6_OFF_TORCH_CRYSTAL@3.png?size=217','Crystal Torch'),
('水晶火把','T6_OFF_TORCH_CRYSTAL@4',6,4,'副手',10,'https://render.albiononline.com/v1/item/T6_OFF_TORCH_CRYSTAL@4.png?size=217','Crystal Torch'),
('水晶火把','T7_OFF_TORCH_CRYSTAL',7,0,'副手',7,'https://render.albiononline.com/v1/item/T7_OFF_TORCH_CRYSTAL.png?size=217','Crystal Torch'),
('水晶火把','T7_OFF_TORCH_CRYSTAL@1',7,1,'副手',8,'https://render.albiononline.com/v1/item/T7_OFF_TORCH_CRYSTAL@1.png?size=217','Crystal Torch'),
('水晶火把','T7_OFF_TORCH_CRYSTAL@2',7,2,'副手',9,'https://render.albiononline.com/v1/item/T7_OFF_TORCH_CRYSTAL@2.png?size=217','Crystal Torch'),
('水晶火把','T7_OFF_TORCH_CRYSTAL@3',7,3,'副手',10,'https://render.albiononline.com/v1/item/T7_OFF_TORCH_CRYSTAL@3.png?size=217','Crystal Torch'),
('水晶火把','T7_OFF_TORCH_CRYSTAL@4',7,4,'副手',11,'https://render.albiononline.com/v1/item/T7_OFF_TORCH_CRYSTAL@4.png?size=217','Crystal Torch'),
('水晶火把','T8_OFF_TORCH_CRYSTAL',8,0,'副手',8,'https://render.albiononline.com/v1/item/T8_OFF_TORCH_CRYSTAL.png?size=217','Crystal Torch'),
('水晶火把','T8_OFF_TORCH_CRYSTAL@1',8,1,'副手',9,'https://render.albiononline.com/v1/item/T8_OFF_TORCH_CRYSTAL@1.png?size=217','Crystal Torch'),
('水晶火把','T8_OFF_TORCH_CRYSTAL@2',8,2,'副手',10,'https://render.albiononline.com/v1/item/T8_OFF_TORCH_CRYSTAL@2.png?size=217','Crystal Torch'),
('水晶火把','T8_OFF_TORCH_CRYSTAL@3',8,3,'副手',11,'https://render.albiononline.com/v1/item/T8_OFF_TORCH_CRYSTAL@3.png?size=217','Crystal Torch'),
('水晶火把','T8_OFF_TORCH_CRYSTAL@4',8,4,'副手',12,'https://render.albiononline.com/v1/item/T8_OFF_TORCH_CRYSTAL@4.png?size=217','Crystal Torch');

-- 3. 水晶火把 P8/P9/P10 设置 popularity=5
UPDATE equipment_catalog SET popularity=5
  WHERE name='水晶火把' AND ((level=4 AND quality=4) OR (level=5 AND quality=3) OR (level=6 AND quality=2) OR (level=7 AND quality=1) OR (level=8 AND quality=0) OR (level=5 AND quality=4) OR (level=6 AND quality=3) OR (level=7 AND quality=2) OR (level=8 AND quality=1) OR (level=6 AND quality=4) OR (level=7 AND quality=3) OR (level=8 AND quality=2));

-- 执行完毕，请运行 generate-phash 接口重算 pHash
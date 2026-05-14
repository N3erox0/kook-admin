-- ============================================================
-- 综合更新 SQL
-- 1. 装备正确名称更新
-- 2. 别名补充
-- 3. 热门坐骑入库（恐狼5/6级 + 迅爪 + 铠马）
-- ============================================================

-- 1. 正确名称 + 别名更新
UPDATE equipment_catalog SET name='潜行者法杖'
  WHERE name='徘徊者法杖' AND albion_id LIKE '%SHAPESHIFTER_SET1%';
UPDATE equipment_catalog SET name='林语者法杖'
  WHERE name='根缚法杖' AND albion_id LIKE '%SHAPESHIFTER_SET2%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '树人'
    WHEN aliases NOT LIKE '%树人%' THEN CONCAT(aliases,',树人')
    ELSE aliases END
  WHERE name='林语者法杖' AND albion_id LIKE '%SHAPESHIFTER_SET2%';
UPDATE equipment_catalog SET name='原始野性法杖'
  WHERE name='原始法杖' AND albion_id LIKE '%SHAPESHIFTER_SET3%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '熊'
    WHEN aliases NOT LIKE '%熊%' THEN CONCAT(aliases,',熊')
    ELSE aliases END
  WHERE name='原始野性法杖' AND albion_id LIKE '%SHAPESHIFTER_SET3%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '狼人'
    WHEN aliases NOT LIKE '%狼人%' THEN CONCAT(aliases,',狼人')
    ELSE aliases END
  WHERE name='血月法杖' AND albion_id LIKE '%SHAPESHIFTER_MORGANA%';
UPDATE equipment_catalog SET name='炼狱裂隙法杖'
  WHERE name='地狱裔法杖' AND albion_id LIKE '%SHAPESHIFTER_HELL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '小恶魔'
    WHEN aliases NOT LIKE '%小恶魔%' THEN CONCAT(aliases,',小恶魔')
    ELSE aliases END
  WHERE name='炼狱裂隙法杖' AND albion_id LIKE '%SHAPESHIFTER_HELL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '石头人'
    WHEN aliases NOT LIKE '%石头人%' THEN CONCAT(aliases,',石头人')
    ELSE aliases END
  WHERE name='大地符文法杖' AND albion_id LIKE '%SHAPESHIFTER_KEEPER%';
UPDATE equipment_catalog SET name='唤光者法杖'
  WHERE name='唤光者' AND albion_id LIKE '%SHAPESHIFTER_AVALON%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '光鸟'
    WHEN aliases NOT LIKE '%光鸟%' THEN CONCAT(aliases,',光鸟')
    ELSE aliases END
  WHERE name='唤光者法杖' AND albion_id LIKE '%SHAPESHIFTER_AVALON%';
UPDATE equipment_catalog SET name='凝视法杖'
  WHERE name='静凝法杖' AND albion_id LIKE '%SHAPESHIFTER_CRYSTAL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '水晶蛇'
    WHEN aliases NOT LIKE '%水晶蛇%' THEN CONCAT(aliases,',水晶蛇')
    ELSE aliases END
  WHERE name='凝视法杖' AND albion_id LIKE '%SHAPESHIFTER_CRYSTAL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '水晶锤杖'
    WHEN aliases NOT LIKE '%水晶锤杖%' THEN CONCAT(aliases,',水晶锤杖')
    ELSE aliases END
  WHERE name='恐惧风暴君主' AND albion_id LIKE '%MACE_CRYSTAL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '水晶剑'
    WHEN aliases NOT LIKE '%水晶剑%' THEN CONCAT(aliases,',水晶剑')
    ELSE aliases END
  WHERE name='无尽之剑' AND albion_id LIKE '%SWORD_CRYSTAL%';
UPDATE equipment_catalog SET name='裂隙刺刀'
  WHERE name='水晶刺刀' AND albion_id LIKE '%GLAIVE_CRYSTAL%';
UPDATE equipment_catalog SET aliases=CASE
    WHEN (aliases IS NULL OR aliases='') THEN '水晶刺刀'
    WHEN aliases NOT LIKE '%水晶刺刀%' THEN CONCAT(aliases,',水晶刺刀')
    ELSE aliases END
  WHERE name='裂隙刺刀' AND albion_id LIKE '%GLAIVE_CRYSTAL%';

-- 修复血刃分类
UPDATE equipment_catalog SET category='武器' WHERE name='血刃' AND category='食物';

-- 2. 热门坐骑补录 + popularity=5
INSERT IGNORE INTO equipment_catalog
  (name, albion_id, level, quality, category, gear_score, image_url, description) VALUES
('恐狼','T5_MOUNT_DIREWOLF',5,0,'坐骑',5,'https://render.albiononline.com/v1/item/T5_MOUNT_DIREWOLF.png?size=217','Dire Wolf'),
('恐狼','T5_MOUNT_DIREWOLF@1',5,1,'坐骑',6,'https://render.albiononline.com/v1/item/T5_MOUNT_DIREWOLF@1.png?size=217','Dire Wolf'),
('恐狼','T5_MOUNT_DIREWOLF@2',5,2,'坐骑',7,'https://render.albiononline.com/v1/item/T5_MOUNT_DIREWOLF@2.png?size=217','Dire Wolf'),
('恐狼','T5_MOUNT_DIREWOLF@3',5,3,'坐骑',8,'https://render.albiononline.com/v1/item/T5_MOUNT_DIREWOLF@3.png?size=217','Dire Wolf'),
('恐狼','T5_MOUNT_DIREWOLF@4',5,4,'坐骑',9,'https://render.albiononline.com/v1/item/T5_MOUNT_DIREWOLF@4.png?size=217','Dire Wolf'),
('恐狼','T6_MOUNT_DIREWOLF',6,0,'坐骑',6,'https://render.albiononline.com/v1/item/T6_MOUNT_DIREWOLF.png?size=217','Dire Wolf'),
('恐狼','T6_MOUNT_DIREWOLF@1',6,1,'坐骑',7,'https://render.albiononline.com/v1/item/T6_MOUNT_DIREWOLF@1.png?size=217','Dire Wolf'),
('恐狼','T6_MOUNT_DIREWOLF@2',6,2,'坐骑',8,'https://render.albiononline.com/v1/item/T6_MOUNT_DIREWOLF@2.png?size=217','Dire Wolf'),
('恐狼','T6_MOUNT_DIREWOLF@3',6,3,'坐骑',9,'https://render.albiononline.com/v1/item/T6_MOUNT_DIREWOLF@3.png?size=217','Dire Wolf'),
('恐狼','T6_MOUNT_DIREWOLF@4',6,4,'坐骑',10,'https://render.albiononline.com/v1/item/T6_MOUNT_DIREWOLF@4.png?size=217','Dire Wolf'),
('迅爪','T4_MOUNT_SWIFTCLAW',4,0,'坐骑',4,'https://render.albiononline.com/v1/item/T4_MOUNT_SWIFTCLAW.png?size=217','Swiftclaw'),
('迅爪','T4_MOUNT_SWIFTCLAW@1',4,1,'坐骑',5,'https://render.albiononline.com/v1/item/T4_MOUNT_SWIFTCLAW@1.png?size=217','Swiftclaw'),
('迅爪','T4_MOUNT_SWIFTCLAW@2',4,2,'坐骑',6,'https://render.albiononline.com/v1/item/T4_MOUNT_SWIFTCLAW@2.png?size=217','Swiftclaw'),
('迅爪','T4_MOUNT_SWIFTCLAW@3',4,3,'坐骑',7,'https://render.albiononline.com/v1/item/T4_MOUNT_SWIFTCLAW@3.png?size=217','Swiftclaw'),
('迅爪','T4_MOUNT_SWIFTCLAW@4',4,4,'坐骑',8,'https://render.albiononline.com/v1/item/T4_MOUNT_SWIFTCLAW@4.png?size=217','Swiftclaw'),
('迅爪','T5_MOUNT_SWIFTCLAW',5,0,'坐骑',5,'https://render.albiononline.com/v1/item/T5_MOUNT_SWIFTCLAW.png?size=217','Swiftclaw'),
('迅爪','T5_MOUNT_SWIFTCLAW@1',5,1,'坐骑',6,'https://render.albiononline.com/v1/item/T5_MOUNT_SWIFTCLAW@1.png?size=217','Swiftclaw'),
('迅爪','T5_MOUNT_SWIFTCLAW@2',5,2,'坐骑',7,'https://render.albiononline.com/v1/item/T5_MOUNT_SWIFTCLAW@2.png?size=217','Swiftclaw'),
('迅爪','T5_MOUNT_SWIFTCLAW@3',5,3,'坐骑',8,'https://render.albiononline.com/v1/item/T5_MOUNT_SWIFTCLAW@3.png?size=217','Swiftclaw'),
('迅爪','T5_MOUNT_SWIFTCLAW@4',5,4,'坐骑',9,'https://render.albiononline.com/v1/item/T5_MOUNT_SWIFTCLAW@4.png?size=217','Swiftclaw'),
('迅爪','T6_MOUNT_SWIFTCLAW',6,0,'坐骑',6,'https://render.albiononline.com/v1/item/T6_MOUNT_SWIFTCLAW.png?size=217','Swiftclaw'),
('迅爪','T6_MOUNT_SWIFTCLAW@1',6,1,'坐骑',7,'https://render.albiononline.com/v1/item/T6_MOUNT_SWIFTCLAW@1.png?size=217','Swiftclaw'),
('迅爪','T6_MOUNT_SWIFTCLAW@2',6,2,'坐骑',8,'https://render.albiononline.com/v1/item/T6_MOUNT_SWIFTCLAW@2.png?size=217','Swiftclaw'),
('迅爪','T6_MOUNT_SWIFTCLAW@3',6,3,'坐骑',9,'https://render.albiononline.com/v1/item/T6_MOUNT_SWIFTCLAW@3.png?size=217','Swiftclaw'),
('迅爪','T6_MOUNT_SWIFTCLAW@4',6,4,'坐骑',10,'https://render.albiononline.com/v1/item/T6_MOUNT_SWIFTCLAW@4.png?size=217','Swiftclaw'),
('迅爪','T7_MOUNT_SWIFTCLAW',7,0,'坐骑',7,'https://render.albiononline.com/v1/item/T7_MOUNT_SWIFTCLAW.png?size=217','Swiftclaw'),
('迅爪','T7_MOUNT_SWIFTCLAW@1',7,1,'坐骑',8,'https://render.albiononline.com/v1/item/T7_MOUNT_SWIFTCLAW@1.png?size=217','Swiftclaw'),
('迅爪','T7_MOUNT_SWIFTCLAW@2',7,2,'坐骑',9,'https://render.albiononline.com/v1/item/T7_MOUNT_SWIFTCLAW@2.png?size=217','Swiftclaw'),
('迅爪','T7_MOUNT_SWIFTCLAW@3',7,3,'坐骑',10,'https://render.albiononline.com/v1/item/T7_MOUNT_SWIFTCLAW@3.png?size=217','Swiftclaw'),
('迅爪','T7_MOUNT_SWIFTCLAW@4',7,4,'坐骑',11,'https://render.albiononline.com/v1/item/T7_MOUNT_SWIFTCLAW@4.png?size=217','Swiftclaw'),
('迅爪','T8_MOUNT_SWIFTCLAW',8,0,'坐骑',8,'https://render.albiononline.com/v1/item/T8_MOUNT_SWIFTCLAW.png?size=217','Swiftclaw'),
('迅爪','T8_MOUNT_SWIFTCLAW@1',8,1,'坐骑',9,'https://render.albiononline.com/v1/item/T8_MOUNT_SWIFTCLAW@1.png?size=217','Swiftclaw'),
('迅爪','T8_MOUNT_SWIFTCLAW@2',8,2,'坐骑',10,'https://render.albiononline.com/v1/item/T8_MOUNT_SWIFTCLAW@2.png?size=217','Swiftclaw'),
('迅爪','T8_MOUNT_SWIFTCLAW@3',8,3,'坐骑',11,'https://render.albiononline.com/v1/item/T8_MOUNT_SWIFTCLAW@3.png?size=217','Swiftclaw'),
('迅爪','T8_MOUNT_SWIFTCLAW@4',8,4,'坐骑',12,'https://render.albiononline.com/v1/item/T8_MOUNT_SWIFTCLAW@4.png?size=217','Swiftclaw'),
('铠马','T4_MOUNT_ARMORED_HORSE',4,0,'坐骑',4,'https://render.albiononline.com/v1/item/T4_MOUNT_ARMORED_HORSE.png?size=217','Armored Horse'),
('铠马','T4_MOUNT_ARMORED_HORSE@1',4,1,'坐骑',5,'https://render.albiononline.com/v1/item/T4_MOUNT_ARMORED_HORSE@1.png?size=217','Armored Horse'),
('铠马','T4_MOUNT_ARMORED_HORSE@2',4,2,'坐骑',6,'https://render.albiononline.com/v1/item/T4_MOUNT_ARMORED_HORSE@2.png?size=217','Armored Horse'),
('铠马','T4_MOUNT_ARMORED_HORSE@3',4,3,'坐骑',7,'https://render.albiononline.com/v1/item/T4_MOUNT_ARMORED_HORSE@3.png?size=217','Armored Horse'),
('铠马','T4_MOUNT_ARMORED_HORSE@4',4,4,'坐骑',8,'https://render.albiononline.com/v1/item/T4_MOUNT_ARMORED_HORSE@4.png?size=217','Armored Horse'),
('铠马','T5_MOUNT_ARMORED_HORSE',5,0,'坐骑',5,'https://render.albiononline.com/v1/item/T5_MOUNT_ARMORED_HORSE.png?size=217','Armored Horse'),
('铠马','T5_MOUNT_ARMORED_HORSE@1',5,1,'坐骑',6,'https://render.albiononline.com/v1/item/T5_MOUNT_ARMORED_HORSE@1.png?size=217','Armored Horse'),
('铠马','T5_MOUNT_ARMORED_HORSE@2',5,2,'坐骑',7,'https://render.albiononline.com/v1/item/T5_MOUNT_ARMORED_HORSE@2.png?size=217','Armored Horse'),
('铠马','T5_MOUNT_ARMORED_HORSE@3',5,3,'坐骑',8,'https://render.albiononline.com/v1/item/T5_MOUNT_ARMORED_HORSE@3.png?size=217','Armored Horse'),
('铠马','T5_MOUNT_ARMORED_HORSE@4',5,4,'坐骑',9,'https://render.albiononline.com/v1/item/T5_MOUNT_ARMORED_HORSE@4.png?size=217','Armored Horse'),
('铠马','T6_MOUNT_ARMORED_HORSE',6,0,'坐骑',6,'https://render.albiononline.com/v1/item/T6_MOUNT_ARMORED_HORSE.png?size=217','Armored Horse'),
('铠马','T6_MOUNT_ARMORED_HORSE@1',6,1,'坐骑',7,'https://render.albiononline.com/v1/item/T6_MOUNT_ARMORED_HORSE@1.png?size=217','Armored Horse'),
('铠马','T6_MOUNT_ARMORED_HORSE@2',6,2,'坐骑',8,'https://render.albiononline.com/v1/item/T6_MOUNT_ARMORED_HORSE@2.png?size=217','Armored Horse'),
('铠马','T6_MOUNT_ARMORED_HORSE@3',6,3,'坐骑',9,'https://render.albiononline.com/v1/item/T6_MOUNT_ARMORED_HORSE@3.png?size=217','Armored Horse'),
('铠马','T6_MOUNT_ARMORED_HORSE@4',6,4,'坐骑',10,'https://render.albiononline.com/v1/item/T6_MOUNT_ARMORED_HORSE@4.png?size=217','Armored Horse'),
('铠马','T7_MOUNT_ARMORED_HORSE',7,0,'坐骑',7,'https://render.albiononline.com/v1/item/T7_MOUNT_ARMORED_HORSE.png?size=217','Armored Horse'),
('铠马','T7_MOUNT_ARMORED_HORSE@1',7,1,'坐骑',8,'https://render.albiononline.com/v1/item/T7_MOUNT_ARMORED_HORSE@1.png?size=217','Armored Horse'),
('铠马','T7_MOUNT_ARMORED_HORSE@2',7,2,'坐骑',9,'https://render.albiononline.com/v1/item/T7_MOUNT_ARMORED_HORSE@2.png?size=217','Armored Horse'),
('铠马','T7_MOUNT_ARMORED_HORSE@3',7,3,'坐骑',10,'https://render.albiononline.com/v1/item/T7_MOUNT_ARMORED_HORSE@3.png?size=217','Armored Horse'),
('铠马','T7_MOUNT_ARMORED_HORSE@4',7,4,'坐骑',11,'https://render.albiononline.com/v1/item/T7_MOUNT_ARMORED_HORSE@4.png?size=217','Armored Horse'),
('铠马','T8_MOUNT_ARMORED_HORSE',8,0,'坐骑',8,'https://render.albiononline.com/v1/item/T8_MOUNT_ARMORED_HORSE.png?size=217','Armored Horse'),
('铠马','T8_MOUNT_ARMORED_HORSE@1',8,1,'坐骑',9,'https://render.albiononline.com/v1/item/T8_MOUNT_ARMORED_HORSE@1.png?size=217','Armored Horse'),
('铠马','T8_MOUNT_ARMORED_HORSE@2',8,2,'坐骑',10,'https://render.albiononline.com/v1/item/T8_MOUNT_ARMORED_HORSE@2.png?size=217','Armored Horse'),
('铠马','T8_MOUNT_ARMORED_HORSE@3',8,3,'坐骑',11,'https://render.albiononline.com/v1/item/T8_MOUNT_ARMORED_HORSE@3.png?size=217','Armored Horse'),
('铠马','T8_MOUNT_ARMORED_HORSE@4',8,4,'坐骑',12,'https://render.albiononline.com/v1/item/T8_MOUNT_ARMORED_HORSE@4.png?size=217','Armored Horse');

UPDATE equipment_catalog SET popularity=5 WHERE name='恐狼' AND level IN (5,6);
UPDATE equipment_catalog SET popularity=5 WHERE name='迅爪';
UPDATE equipment_catalog SET popularity=5 WHERE name='铠马';

-- 完成，请重算 pHash
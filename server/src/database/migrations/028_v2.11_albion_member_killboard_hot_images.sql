-- V2.11: Albion成员同步、官网战报补装、装备AlbionID与热门图库

-- 1. guilds 增加 Albion 绑定信息
ALTER TABLE guilds ADD COLUMN albion_server VARCHAR(20) NOT NULL DEFAULT 'sgp' COMMENT 'Albion服务器: west/ams/sgp' AFTER resupply_rooms;
ALTER TABLE guilds ADD COLUMN albion_guild_id VARCHAR(80) NULL COMMENT 'Albion公会ID' AFTER albion_server;
ALTER TABLE guilds ADD COLUMN albion_guild_name VARCHAR(100) NULL COMMENT 'Albion公会名称' AFTER albion_guild_id;
ALTER TABLE guilds ADD COLUMN albion_members_last_synced_at DATETIME NULL COMMENT 'Albion成员最后同步时间' AFTER albion_guild_name;
UPDATE guilds SET albion_server='sgp', albion_guild_id='Eeri9pZPQFWGsofMjSUwdg', albion_guild_name='PSC' WHERE name='PSC' AND (albion_guild_id IS NULL OR albion_guild_id='');

-- 2. Albion公会成员快照与KOOK绑定
CREATE TABLE IF NOT EXISTS albion_guild_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id INT NOT NULL COMMENT '系统公会ID',
  albion_server VARCHAR(20) NOT NULL DEFAULT 'sgp' COMMENT 'Albion服务器',
  albion_guild_id VARCHAR(80) NOT NULL COMMENT 'Albion公会ID',
  albion_guild_name VARCHAR(100) NULL COMMENT 'Albion公会名称',
  player_id VARCHAR(80) NOT NULL COMMENT 'Albion玩家ID',
  player_name VARCHAR(100) NOT NULL COMMENT 'Albion玩家名',
  alliance_id VARCHAR(80) NULL COMMENT '联盟ID',
  alliance_name VARCHAR(100) NULL COMMENT '联盟名称',
  kill_fame BIGINT NOT NULL DEFAULT 0 COMMENT '击杀声望',
  death_fame BIGINT NOT NULL DEFAULT 0 COMMENT '死亡声望',
  status VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT 'active/left',
  joined_at DATETIME NULL COMMENT '加入时间',
  left_at DATETIME NULL COMMENT '离开时间',
  last_synced_at DATETIME NULL COMMENT '最后同步时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_agm_guild_player (guild_id, player_id),
  KEY idx_agm_guild (guild_id),
  KEY idx_agm_player (player_id),
  KEY idx_agm_name (player_name),
  KEY idx_agm_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Albion公会成员快照';

CREATE TABLE IF NOT EXISTS member_albion_bindings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id INT NOT NULL COMMENT '系统公会ID',
  guild_member_id INT NULL COMMENT 'KOOK成员表ID',
  kook_user_id VARCHAR(50) NULL COMMENT 'KOOK用户ID',
  kook_nickname VARCHAR(100) NULL COMMENT 'KOOK昵称',
  albion_player_id VARCHAR(80) NOT NULL COMMENT 'Albion玩家ID',
  albion_player_name VARCHAR(100) NOT NULL COMMENT 'Albion玩家名',
  bind_type VARCHAR(20) NOT NULL DEFAULT 'manual' COMMENT 'auto/manual',
  status VARCHAR(10) NOT NULL DEFAULT 'active' COMMENT 'active/disabled',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_mab_guild_player (guild_id, albion_player_id),
  KEY idx_mab_guild (guild_id),
  KEY idx_mab_member (guild_member_id),
  KEY idx_mab_albion_player (albion_player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Albion成员与KOOK成员绑定';

-- 3. 装备相关表补充 albion_id 与 item_quality
ALTER TABLE guild_inventory ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID' AFTER catalog_id;
ALTER TABLE guild_inventory ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质，仅展示保留，库存统计/扣减忽略' AFTER albion_id;
CREATE INDEX idx_gi_albion_id ON guild_inventory(albion_id);
UPDATE guild_inventory gi JOIN equipment_catalog c ON gi.catalog_id=c.id SET gi.albion_id=c.albion_id WHERE gi.albion_id IS NULL;

ALTER TABLE inventory_logs ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID快照' AFTER equipment_name;
ALTER TABLE inventory_logs ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质快照，仅展示保留' AFTER albion_id;
CREATE INDEX idx_invlog_albion_id ON inventory_logs(albion_id);

ALTER TABLE ocr_recognition_item ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID' AFTER equipment_name;
ALTER TABLE ocr_recognition_item ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质，仅展示保留' AFTER albion_id;

ALTER TABLE resupply_requests ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID' AFTER equipment_name;
ALTER TABLE resupply_requests ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质，仅展示保留' AFTER albion_id;

ALTER TABLE equipment_inventory ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID' AFTER name;
ALTER TABLE equipment_inventory ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质，仅展示保留，库存统计/扣减忽略' AFTER albion_id;
CREATE INDEX idx_equipment_albion_id ON equipment_inventory(albion_id);

ALTER TABLE equipment_images ADD COLUMN albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID' AFTER image_url;

ALTER TABLE equipment_images ADD COLUMN item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质' AFTER albion_id;
ALTER TABLE equipment_images ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'manual_upload' COMMENT 'manual_upload/official_library/albion_render' AFTER item_quality;
CREATE INDEX idx_ei_albion_id ON equipment_images(albion_id);

-- 4. 补装申请增加官网战报字段
ALTER TABLE guild_resupply ADD COLUMN source VARCHAR(30) NULL COMMENT '来源 ocr/killboard/manual/kook_text' AFTER kook_message_time;
ALTER TABLE guild_resupply ADD COLUMN albion_event_id BIGINT NULL COMMENT 'Albion官网战报事件ID' AFTER source;
ALTER TABLE guild_resupply ADD COLUMN albion_battle_id BIGINT NULL COMMENT 'Albion官网战斗ID' AFTER albion_event_id;
ALTER TABLE guild_resupply ADD COLUMN kill_time_utc DATETIME NULL COMMENT '官网/截图UTC死亡时间' AFTER albion_battle_id;
ALTER TABLE guild_resupply ADD COLUMN killboard_match_status VARCHAR(20) NULL COMMENT 'matched/unmatched/pending' AFTER kill_time_utc;
ALTER TABLE guild_resupply ADD COLUMN killboard_time_diff_minutes DECIMAL(6,2) NULL COMMENT '官网战报时间差分钟' AFTER killboard_match_status;
ALTER TABLE guild_resupply ADD COLUMN killboard_url VARCHAR(500) NULL COMMENT '官网战报链接' AFTER killboard_time_diff_minutes;
ALTER TABLE guild_resupply ADD COLUMN killboard_raw JSON NULL COMMENT '官网战报原始JSON' AFTER killboard_url;
CREATE INDEX idx_gr_albion_event ON guild_resupply(albion_event_id);

CREATE TABLE IF NOT EXISTS guild_resupply_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  resupply_id INT NOT NULL COMMENT '补装申请ID',
  catalog_id INT NULL COMMENT '装备参考库ID',
  albion_id VARCHAR(100) NULL COMMENT 'Albion装备唯一ID',
  equipment_name VARCHAR(100) NULL COMMENT '装备显示名',
  slot VARCHAR(20) NULL COMMENT '部位',
  level INT NULL COMMENT '等级 1~8',
  enchant_level INT NULL COMMENT '附魔/宝石点数 0~4',
  item_quality TINYINT NOT NULL DEFAULT 0 COMMENT '装备边框品质',
  quantity INT NOT NULL DEFAULT 1 COMMENT '数量',
  source VARCHAR(20) NOT NULL DEFAULT 'killboard' COMMENT 'killboard/manual/ocr',
  match_status VARCHAR(20) NOT NULL DEFAULT 'matched' COMMENT 'matched/unmatched/manual',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_gri_resupply (resupply_id),
  KEY idx_gri_catalog (catalog_id),
  KEY idx_gri_albion (albion_id),
  CONSTRAINT fk_gri_resupply FOREIGN KEY (resupply_id) REFERENCES guild_resupply(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='补装申请装备明细';

-- V3.0 战报表（Albion Killboard 死亡记录）
CREATE TABLE IF NOT EXISTS `battle_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `guild_id` int NOT NULL COMMENT '公会ID',
  `member_name` varchar(100) NOT NULL COMMENT '死亡成员游戏名',
  `albion_player_id` varchar(100) DEFAULT NULL COMMENT 'Albion 玩家ID',
  `albion_event_id` bigint NOT NULL COMMENT 'Albion 事件ID（去重用）',
  `battle_id` bigint DEFAULT NULL COMMENT '战斗ID',
  `death_time` datetime NOT NULL COMMENT '死亡时间',
  `death_map` varchar(200) DEFAULT NULL COMMENT '死亡地图',
  `killer_name` varchar(100) DEFAULT NULL COMMENT '击杀者名称',
  `killer_guild` varchar(100) DEFAULT NULL COMMENT '击杀者公会',
  `equipment_list` json DEFAULT NULL COMMENT '死亡装备列表JSON',
  `total_kill_fame` int DEFAULT 0 COMMENT '击杀声望',
  `raw_event` json DEFAULT NULL COMMENT '原始API事件数据',
  `matched_resupply` tinyint(1) DEFAULT 0 COMMENT '是否已匹配补装申请',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_battle_reports_event_id` (`albion_event_id`),
  KEY `IDX_battle_reports_guild_time` (`guild_id`, `death_time`),
  KEY `IDX_battle_reports_guild_member` (`guild_id`, `member_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='战报记录（Albion Killboard）';

-- guilds 表新增 albion_guild_id 和 albion_server 字段（如果不存在）
ALTER TABLE `guilds` ADD COLUMN IF NOT EXISTS `albion_guild_id` varchar(100) DEFAULT NULL COMMENT 'Albion 公会ID（用于拉取战报）';
ALTER TABLE `guilds` ADD COLUMN IF NOT EXISTS `albion_server` varchar(20) DEFAULT 'sgp' COMMENT 'Albion 服务器（sgp/ams/west）';

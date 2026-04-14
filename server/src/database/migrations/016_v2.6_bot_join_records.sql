-- V2.6 Bot 加入服务器记录表
CREATE TABLE IF NOT EXISTS bot_join_records (
  id INT AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(50) NOT NULL COMMENT 'KOOK服务器ID',
  guild_name VARCHAR(100) COMMENT '服务器名称',
  guild_icon VARCHAR(500) COMMENT '服务器图标',
  inviter_kook_id VARCHAR(50) COMMENT '邀请人KOOK ID（服务器主）',
  inviter_username VARCHAR(100) COMMENT '邀请人用户名',
  inviter_identify_num VARCHAR(10) COMMENT '邀请人识别号',
  status VARCHAR(20) DEFAULT 'pending' COMMENT '状态: pending/activated/left',
  invite_code_id INT COMMENT '关联的邀请码ID',
  guild_member_count INT COMMENT '服务器成员数',
  joined_at DATETIME NOT NULL COMMENT 'Bot加入时间',
  activated_at DATETIME COMMENT '激活时间',
  created_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_bjr_guild_id (guild_id)
) COMMENT='Bot加入服务器记录';

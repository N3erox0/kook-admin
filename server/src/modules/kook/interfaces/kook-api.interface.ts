// ========== KOOK API 通用响应 ==========
export interface KookApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// ========== 分页 Meta ==========
export interface KookPaginationMeta {
  page: number;
  page_total: number;
  page_size: number;
  total: number;
}

// ========== 用户/成员 ==========
export interface KookMember {
  id: string;
  username: string;
  identify_num: string;
  nickname: string;
  avatar: string;
  vip_avatar: string;
  roles: number[];
  online: boolean;
  bot: boolean;
  status: number;
  mobile_verified: boolean;
}

export interface KookGuildUserListData {
  items: KookMember[];
  meta: KookPaginationMeta;
  user_count: number;
  online_count: number;
  offline_count: number;
  sort: Record<string, number>;
}

// ========== 服务器详情 ==========
export interface KookGuildView {
  id: string;
  name: string;
  topic: string;
  user_id: string;
  icon: string;
  notify_type: number;
  region: string;
  enable_open: boolean;
  open_id: string;
  default_channel_id: string;
  welcome_channel_id: string;
  roles: KookRole[];
  channels: KookChannel[];
}

// ========== 角色 ==========
export interface KookRole {
  role_id: number;
  name: string;
  color: number;
  position: number;
  hoist: number;
  mentionable: number;
  permissions: number;
}

export interface KookRoleListData {
  items: KookRole[];
  meta: KookPaginationMeta;
}

// ========== 频道 ==========
export interface KookChannel {
  id: string;
  name: string;
  user_id: string;
  guild_id: string;
  parent_id: string;
  type: number; // 1=文字, 2=语音
  level: number;
  limit_amount: number;
  is_category: boolean;
  topic?: string;
  slow_mode?: number;
}

// ========== 消息 ==========
export interface KookMessageAuthor {
  id: string;
  username: string;
  identify_num: string;
  nickname: string;
  avatar: string;
  online: boolean;
  bot: boolean;
}

export interface KookMessage {
  id: string;
  type: number; // 1=文本, 2=图片, 9=KMarkdown, 10=卡片
  content: string;
  author: KookMessageAuthor;
  mention: string[];
  mention_all: boolean;
  mention_roles: number[];
  mention_here: boolean;
  embeds: any[];
  attachments: any;
  reactions: KookReaction[];
  quote: any;
  create_at: number;
  updated_at: number;
}

export interface KookReaction {
  emoji: { id: string; name: string };
  count: number;
  me: boolean;
}

export interface KookMessageListData {
  items: KookMessage[];
}

export interface KookMessageCreateResult {
  msg_id: string;
  msg_timestamp: number;
  nonce: string;
}

// ========== 用户详情（含 joined_at） ==========
export interface KookUserView {
  id: string;
  username: string;
  identify_num: string;
  nickname: string;
  avatar: string;
  online: boolean;
  bot: boolean;
  status: number;
  roles: number[];
  joined_at: number;
  active_time: number;
}

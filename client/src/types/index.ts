// ===== 公会 =====
export interface Guild {
  id: number;
  name: string;
  iconUrl: string | null;
  kookGuildId: string;
  kookBotToken?: string;
  kookVerifyToken?: string;
  kookWebhookEnabled?: number;
  kookResupplyChannelId?: string;
  kookAdminChannelId?: string;
  kookAdminRoleId?: string;
  kookListenChannelIds?: string[];
  ownerUserId: number;
  status: number;
  createdAt: string;
}

export interface GuildInfo {
  guildId: number;
  guildName: string;
  guildIcon: string | null;
  role: string;
}

// ===== 邀请码（v4重构） =====
export interface InviteCode {
  id: number;
  code: string;
  status: 'enabled' | 'used' | 'disabled' | 'revoked';
  usedByUserId: number | null;
  boundGuildId: number | null;
  boundGuildName: string | null;
  usedAt: string | null;
  createdBy: number | null;
  createSource: string;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

// ===== 装备参考库 =====
export interface EquipmentCatalog {
  id: number;
  name: string;
  level: number;
  quality: number;
  category: string;
  gearScore: number;
  imageUrl: string | null;
  description: string | null;
}

// ===== 公会成员 =====
export interface GuildMember {
  id: number;
  guildId: number;
  kookUserId: string;
  nickname: string;
  kookRoles: any;
  role: string;
  status: string;
  joinedAt: string;
  leftAt: string | null;
  lastSyncedAt: string;
  createdAt: string;
}

// ===== 公会库存 =====
export interface GuildInventory {
  id: number;
  guildId: number;
  catalogId: number;
  quantity: number;
  location: string;
  remark: string | null;
  isCounted: number;
  catalog?: EquipmentCatalog;
  createdAt: string;
  updatedAt: string;
}

// ===== 补装申请 =====
export interface GuildResupply {
  id: number;
  guildId: number;
  guildMemberId: number | null;
  kookUserId: string;
  kookNickname: string;
  equipmentIds: string | null;
  quantity: number;
  applyType: string;
  reason: string | null;
  screenshotUrl: string | null;
  status: number;
  processedBy: number | null;
  processRemark: string | null;
  processedAt: string | null;
  dispatchedBy: number | null;
  dispatchedAt: string | null;
  dispatchQuantity: number | null;
  isCounted: number;
  dedupHash: string | null;
  resupplyBox: string | null;
  resupplyRoom: string | null;
  killDate: string | null;
  mapName: string | null;
  gameId: string | null;
  ocrGuildName: string | null;
  kookMessageTime: string | null;
  createdAt: string;
  logs?: ResupplyLog[];
}

export interface ResupplyLog {
  id: number;
  action: string;
  operatorName: string;
  fromStatus: string;
  toStatus: string;
  remark: string;
  createdAt: string;
}

// ===== 预警 =====
export interface GuildAlertRule {
  id: number;
  guildId: number;
  ruleType: string;
  ruleName: string;
  equipmentName: string | null;
  gearScoreValue: string | null;
  category: string | null;
  gearScoreMin: number | null;
  gearScoreMax: number | null;
  threshold: number;
  enabled: number;
  createdAt: string;
}

// ===== 操作日志 =====
export interface OperationLog {
  id: number;
  guildId: number | null;
  userId: number;
  username: string;
  module: string;
  action: string;
  targetType: string;
  targetId: number;
  responseStatus: number;
  ipAddress: string;
  createdAt: string;
}

// ===== 用户 =====
export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
  kookUserId: string | null;
  globalRole: string | null;
}

// ===== 常量 =====
export const CATEGORIES = ['武器', '副手', '头', '甲', '鞋', '坐骑', '披风', '药水', '食物', '其他'];
export const GUILD_ROLES = ['super_admin', 'inventory_admin', 'resupply_staff', 'normal'];
export const RESUPPLY_STATUS: Record<number, string> = { 0: '待处理', 1: '已通过', 2: '已驳回', 3: '已发放' };
export const QUALITY_LABELS = ['白', '绿', '蓝', '紫', '橙'];

export const INVITE_CODE_STATUS: Record<string, { label: string; color: string }> = {
  disabled: { label: '未激活', color: 'default' },
  enabled: { label: '已启用', color: 'green' },
  used: { label: '已激活', color: 'blue' },
  revoked: { label: '无效', color: 'red' },
};

export const ROLE_LABELS: Record<string, string> = {
  super_admin: '超级管理员',
  ssvip: 'SSVIP',
  inventory_admin: '库存管理员',
  resupply_staff: '补装管理员',
  normal: '普通成员',
};

export const ALERT_RULE_TYPE: Record<string, string> = {
  '01': '补装库存预警',
  '02': '死亡次数预警',
};

// ===== 装备显示格式化 =====
const TIER_PREFIX_MAP: Record<string, string> = {
  '新手级': '', '学徒级': '', '熟练级': '', '老手级': '', '专家级': '',
  '大师级': '', '宗师级': '', '禅师级': '',
};

/**
 * 格式化装备显示名称
 * 输入: { name: '专家级堕神法杖', level: 5, quality: 1, gearScore: 6, category: '武器' }
 * 输出: '51堕神法杖 P6 武器'
 */
export function formatEquipName(item: { name?: string; level?: number; quality?: number; gearScore?: number; category?: string }): string {
  if (!item?.name) return '-';
  let name = item.name;
  // 去掉中文等级前缀
  for (const prefix of Object.keys(TIER_PREFIX_MAP)) {
    if (name.startsWith(prefix)) { name = name.slice(prefix.length); break; }
  }
  const lv = item.level ?? 0;
  const q = item.quality ?? 0;
  const gs = item.gearScore ?? (lv + q);
  const cat = item.category || '';
  return `${lv}${q}${name} P${gs}${cat ? ' ' + cat : ''}`;
}

/**
 * 格式化装备下拉选项标签
 */
export function formatEquipOption(item: { name?: string; level?: number; quality?: number; gearScore?: number; category?: string }): string {
  return formatEquipName(item);
}

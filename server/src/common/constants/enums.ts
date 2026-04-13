// ========== 公会成员管理角色 ==========
export enum GuildRole {
  SUPER_ADMIN = 'super_admin',         // 超级管理员：全部权限
  SSVIP = 'ssvip',                     // SSVIP：查看邀请码/公会列表，可切换查看所有公会（仅查看无操作）
  INVENTORY_ADMIN = 'inventory_admin', // 库存管理员：增删改装备库存
  RESUPPLY_STAFF = 'resupply_staff',   // 补装人员：处理补装+查看库存+查看成员
  NORMAL = 'normal',                   // 普通成员：仅查看
}

// ========== 成员状态（2种） ==========
export enum MemberStatus {
  ACTIVE = 'active',  // 在会
  LEFT = 'left',      // 已离开
}

// ========== 补装申请状态 ==========
export enum ResupplyStatus {
  PENDING = 0,      // 待处理
  APPROVED = 1,     // 已通过（不扣库存）
  REJECTED = 2,     // 已驳回
  DISPATCHED = 3,   // 已发放（扣库存）
}

// ========== 装备部位(category) 10种 ==========
export enum EquipmentCategory {
  WEAPON = '武器',
  OFFHAND = '副手',
  HEAD = '头',
  ARMOR = '甲',
  BOOTS = '鞋',
  MOUNT = '坐骑',
  CLOAK = '披风',
  POTION = '药水',
  FOOD = '食物',
  OTHER = '其他',
}

// ========== 品质等级 (0~4) ==========
export enum QualityLevel {
  Q0 = 0,
  Q1 = 1,
  Q2 = 2,
  Q3 = 3,
  Q4 = 4,
}

// ========== 用户状态 ==========
export enum UserStatus {
  DISABLED = 0,
  ENABLED = 1,
}

// ========== 补装申请类型 ==========
export enum ApplyType {
  DEATH_RESUPPLY = '死亡补装',
  REOC = 'REOC',
  MANUAL = '手动创建',
  // 兼容旧数据
  RESUPPLY = '补装',
  OC_BROKEN = 'OC碎',
  OTHER = '其他',
}

// ========== 邀请码状态（v4重构） ==========
export enum InviteCodeStatus {
  ENABLED = 'enabled',     // 启用（可使用）
  USED = 'used',           // 已使用（绑定公会，不可修改状态）
  DISABLED = 'disabled',   // 未启用
  REVOKED = 'revoked',     // 作废
}

// ========== 预警规则类型 ==========
export enum AlertRuleType {
  INVENTORY_ALERT = '01',   // 补装库存预警
  DEATH_COUNT_ALERT = '02', // 死亡次数预警
}

// ========== 全局用户角色 ==========
export enum GlobalRole {
  SSVIP = 'ssvip',  // 系统级SSVIP
}

// ========== 公会状态 ==========
export enum GuildStatus {
  PENDING_ACTIVATION = 0, // 待激活（机器人已入驻但未完成注册）
  ACTIVE = 1,             // 已激活
  DISABLED = 2,           // 已禁用
}

// ========== 成员加入方式 ==========
export enum MemberJoinSource {
  KOOK_SYNC = 'kook_sync',       // KOOK自动同步
  INVITE_LINK = 'invite_link',   // 邀请链接
  MANUAL = 'manual',             // 手动录入
  WEBHOOK = 'webhook',           // Webhook事件自动
}

// ========== 所有部位列表（便于遍历） ==========
export const ALL_CATEGORIES = [
  EquipmentCategory.WEAPON,
  EquipmentCategory.OFFHAND,
  EquipmentCategory.HEAD,
  EquipmentCategory.ARMOR,
  EquipmentCategory.BOOTS,
  EquipmentCategory.MOUNT,
  EquipmentCategory.CLOAK,
  EquipmentCategory.POTION,
  EquipmentCategory.FOOD,
  EquipmentCategory.OTHER,
];

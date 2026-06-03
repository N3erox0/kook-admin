/**
 * V3.3.0 纯文本关键词解析器
 *
 * 负责把 KOOK 监听频道的两类文本消息解析为结构化数据：
 *
 * 1. 死亡补装：
 *    样例：击杀详情【05/31/2026 14:41】(UTC时间)游戏名【yesbabe】备注【金风】
 *    - 关键词：消息含 "击杀详情"
 *    - 时间块：第一个【】内的时间字符串（支持 4 种格式，按 UTC 解析）
 *    - 游戏名：游戏名【...】
 *    - 备注  ：备注【...】（可选）
 *
 * 2. OC 碎补装：
 *    样例：OC碎【P8堕神奶杖、P8皇家鞋、P8冰箱头、平8石棺盾】游戏名【yesbabe】备注【金风】
 *    - 关键词：消息含 "OC碎"
 *    - 装备清单：OC碎【...】 内的清单（分隔符：、 ， , 空格）
 *      若无【】 → 退到 "碎" 字之后拆词（旧规则兜底）
 *    - 游戏名：游戏名【...】（可选）
 *    - 备注  ：备注【...】（可选）
 *
 * 设计原则：
 * - 纯函数，无依赖，便于单元测试
 * - 中文/英文【】(全角/半角) 都支持
 * - 时间解析支持 4 种格式，全部按 UTC 处理
 * - 无法识别的内容不抛异常，返回 null 让上层走待识别工作区
 */

/** 解析结果类型 */
export type V3MessageType = 'death_kill_detail' | 'oc_broken' | 'unknown';

export interface DeathParseResult {
  type: 'death_kill_detail';
  /** UTC 死亡时间（ISO 字符串），无法解析则为 null */
  killTimeUtc: string | null;
  /** 时间块原文，用于备注/日志 */
  rawTimeStr: string | null;
  /** 游戏名（玩家名） */
  gameName: string | null;
  /** 备注【】内文本 */
  remark: string | null;
  /** 解析后剩余的原始文本（去掉已命中的【】块），写入 reason */
  residualText: string;
}

export interface OcBrokenParseResult {
  type: 'oc_broken';
  /** OC碎【】内提取的装备词段；若【】缺失，回退到旧规则结果 */
  equipmentSegments: string[];
  /** 是否走【】路径（true=新规则；false=旧规则兜底） */
  fromBracket: boolean;
  /** 游戏名【】 */
  gameName: string | null;
  /** 备注【】 */
  remark: string | null;
  /** 解析后剩余的原始文本 */
  residualText: string;
}

export type V3ParseResult =
  | DeathParseResult
  | OcBrokenParseResult
  | { type: 'unknown' };

/** 全/半角【】统一为半角 [...] 后正则更稳 */
function normalizeBrackets(text: string): string {
  return text.replace(/【/g, '[').replace(/】/g, ']');
}

/** 提取首个 `prefix[...]` 的内容（prefix 可为空表示首个 [...]）。返回 {content, fullMatch}。 */
function extractBracketContent(
  text: string,
  prefix: string,
): { content: string; fullMatch: string } | null {
  // prefix 转义
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\[([^\\[\\]]*)\\]`);
  const m = text.match(re);
  if (!m) return null;
  return { content: m[1].trim(), fullMatch: m[0] };
}

/**
 * 解析时间字符串（统一按 UTC）
 *
 * 支持格式：
 *   1. MM/DD/YYYY HH:mm[:ss]      (05/31/2026 14:41)
 *   2. YYYY-MM-DD HH:mm[:ss]      (2026-05-31 14:41:23)
 *   3. YYYY/MM/DD HH:mm[:ss]      (2026/05/31 14:41)
 *   4. M月D日 HH:mm[:ss]          (5月31日 14:41)
 *
 * @param raw 时间字符串
 * @returns ISO 字符串（UTC），无法解析返回 null
 */
export function parseUtcTime(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();

  // 1. MM/DD/YYYY HH:mm[:ss]
  let m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const hour = parseInt(m[4], 10);
    const min = parseInt(m[5], 10);
    const sec = m[6] ? parseInt(m[6], 10) : 0;
    if (isValidYmd(year, month, day)) {
      return new Date(Date.UTC(year, month, day, hour, min, sec)).toISOString();
    }
  }

  // 2. YYYY-MM-DD HH:mm[:ss] 或 3. YYYY/MM/DD HH:mm[:ss]
  m = s.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const hour = parseInt(m[4], 10);
    const min = parseInt(m[5], 10);
    const sec = m[6] ? parseInt(m[6], 10) : 0;
    if (isValidYmd(year, month, day)) {
      return new Date(Date.UTC(year, month, day, hour, min, sec)).toISOString();
    }
  }

  // 4. M月D日 HH:mm[:ss]（年默认当年 UTC）
  m = s.match(/^(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const year = new Date().getUTCFullYear();
    const month = parseInt(m[1], 10) - 1;
    const day = parseInt(m[2], 10);
    const hour = parseInt(m[3], 10);
    const min = parseInt(m[4], 10);
    const sec = m[5] ? parseInt(m[5], 10) : 0;
    if (isValidYmd(year, month, day)) {
      return new Date(Date.UTC(year, month, day, hour, min, sec)).toISOString();
    }
  }

  return null;
}

function isValidYmd(year: number, monthZeroBased: number, day: number): boolean {
  if (year < 2020 || year > 2100) return false;
  if (monthZeroBased < 0 || monthZeroBased > 11) return false;
  if (day < 1 || day > 31) return false;
  return true;
}

/** 判断是否含死亡补装关键词 */
export function isDeathKeyword(text: string): boolean {
  if (!text) return false;
  return /击杀详情|擊殺詳情|擊殺詳細資訊/i.test(text);
}

/** 判断是否含 OC 碎关键词 */
export function isOcBrokenKeyword(text: string): boolean {
  if (!text) return false;
  return /OC\s?碎/i.test(text);
}

/**
 * 主入口：根据消息内容判断类型并解析
 */
export function parseV3Message(text: string): V3ParseResult {
  if (!text || !text.trim()) return { type: 'unknown' };

  const normalized = normalizeBrackets(text);

  if (isDeathKeyword(normalized)) {
    return parseDeathMessage(normalized);
  }
  if (isOcBrokenKeyword(normalized)) {
    return parseOcBrokenMessage(normalized);
  }
  return { type: 'unknown' };
}

/**
 * 解析死亡补装消息
 *
 * 时间块定位策略：
 *   1. 先尝试 `时间[...]` 显式标注
 *   2. 否则取消息中第一个 `[...]` 内容
 */
function parseDeathMessage(normalized: string): DeathParseResult {
  let killTimeUtc: string | null = null;
  let rawTimeStr: string | null = null;
  const consumed: string[] = []; // 已命中的【】片段，用于从 residualText 移除

  // 策略 1: 显式 "时间[...]"
  let timeBracket = extractBracketContent(normalized, '时间');
  if (!timeBracket) {
    // 策略 2: 第一个 [...] 内容
    const firstBracket = normalized.match(/\[([^\[\]]*)\]/);
    if (firstBracket) {
      timeBracket = { content: firstBracket[1].trim(), fullMatch: firstBracket[0] };
    }
  }
  if (timeBracket) {
    rawTimeStr = timeBracket.content;
    killTimeUtc = parseUtcTime(timeBracket.content);
    consumed.push(timeBracket.fullMatch);
  }

  // 游戏名
  const gameBracket = extractBracketContent(normalized, '游戏名');
  const gameName = gameBracket?.content || null;
  if (gameBracket) consumed.push(gameBracket.fullMatch);

  // 备注
  const remarkBracket = extractBracketContent(normalized, '备注');
  const remark = remarkBracket?.content || null;
  if (remarkBracket) consumed.push(remarkBracket.fullMatch);

  // 计算 residualText：原文 - 已命中【】片段
  let residualText = normalized;
  for (const c of consumed) {
    residualText = residualText.replace(c, ' ');
  }
  // 去掉关键词本身（避免噪音）
  residualText = residualText.replace(/击杀详情|擊殺詳情|擊殺詳細資訊/g, ' ');
  residualText = residualText.replace(/\(UTC时间\)|（UTC时间）|UTC时间/g, ' ');
  residualText = residualText.replace(/\s+/g, ' ').trim();

  return {
    type: 'death_kill_detail',
    killTimeUtc,
    rawTimeStr,
    gameName,
    remark,
    residualText,
  };
}

/**
 * 解析 OC 碎消息
 *
 * 装备清单提取：
 *   1. 优先 `OC碎[...]` 内的清单
 *   2. 否则回退到 "碎" 字之后的内容拆词（旧规则兜底）
 */
function parseOcBrokenMessage(normalized: string): OcBrokenParseResult {
  let equipmentSegments: string[] = [];
  let fromBracket = false;
  const consumed: string[] = [];

  // 策略 1: OC碎[...]
  const ocBracket =
    extractBracketContent(normalized, 'OC碎') ||
    extractBracketContent(normalized, 'oc碎') ||
    extractBracketContent(normalized, 'OC 碎');
  if (ocBracket && ocBracket.content) {
    fromBracket = true;
    consumed.push(ocBracket.fullMatch);
    equipmentSegments = splitEquipmentList(ocBracket.content);
  }

  // 游戏名
  const gameBracket = extractBracketContent(normalized, '游戏名');
  const gameName = gameBracket?.content || null;
  if (gameBracket) consumed.push(gameBracket.fullMatch);

  // 备注
  const remarkBracket = extractBracketContent(normalized, '备注');
  const remark = remarkBracket?.content || null;
  if (remarkBracket) consumed.push(remarkBracket.fullMatch);

  // residualText
  let residualText = normalized;
  for (const c of consumed) {
    residualText = residualText.replace(c, ' ');
  }
  residualText = residualText.replace(/OC\s?碎/gi, ' ');
  residualText = residualText.replace(/\s+/g, ' ').trim();

  return {
    type: 'oc_broken',
    equipmentSegments,
    fromBracket,
    gameName,
    remark,
    residualText,
  };
}

/**
 * 拆分装备清单（顿号/逗号/空格作为分隔符）
 * 输入示例: "P8堕神奶杖、P8皇家鞋、P8冰箱头、平8石棺盾"
 * 输出: ["P8堕神奶杖", "P8皇家鞋", "P8冰箱头", "平8石棺盾"]
 */
export function splitEquipmentList(content: string): string[] {
  if (!content) return [];
  return content
    .split(/[、,，\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 把 residual + remark 合并为 reason 字段（带 800 字截断）
 */
export function buildReason(
  remark: string | null,
  residualText: string,
  maxLen = 800,
): string {
  const parts: string[] = [];
  if (remark) parts.push(`备注:${remark}`);
  if (residualText) parts.push(residualText);
  let s = parts.join(' | ').trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

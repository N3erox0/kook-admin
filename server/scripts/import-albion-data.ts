/**
 * Albion Online 装备数据导入脚本
 * 直接运行：npx ts-node scripts/import-albion-data.ts
 * 或指定最低阶数：npx ts-node scripts/import-albion-data.ts --min-tier 4
 *
 * 数据来源：
 * - 装备列表+中文名：ao-bin-dumps (GitHub)
 * - 装备图片：render.albiononline.com 官方 Render API
 */

const ITEMS_URL = 'https://raw.githubusercontent.com/broderickhyman/ao-bin-dumps/master/formatted/items.json';
const RENDER_URL = 'https://render.albiononline.com/v1/item/{name}.png?size=217';

// ===== 排除规则（优先于包含规则） =====
const EXCLUDE_KW = [
  // 采集装备
  'GATHER_', '_GATHER',
  // 原材料 & 精炼材料
  '_ROCK', '_ORE', '_WOOD', '_FIBER', '_HIDE',
  '_PLANKS', '_METALBAR', '_LEATHER', '_CLOTH', '_STONEBLOCK',
  '_LEVEL', 'ARTEFACT',
  // 技能书 & 日志
  'SKILLBOOK', 'JOURNAL',
  // 鱼类
  'FISH_',
  // 坐骑升级材料
  'MOUNTUPGRADE',
  // 家具 & 装饰
  'FURNITURE', 'UNIQUE_FURNITURE', 'DECORATION',
  // 农作物 & 种子
  'FARM', 'SEED',
  // 碎片/符文
  '_RUNE', '_SOUL', '_RELIC', '_SHARD',
  // 其他非装备
  'TRASH', 'TOKEN', 'EVENT_', 'QUESTITEM', 'LOOTCHEST',
  'UNIQUE_UNLOCK', 'VANITY', 'BACKPACK_SKIN', 'PAPERDOLL',
  'EMOTE', 'FLAG', 'BANNER',
];

// ===== 包含规则：实际穿戴/使用的物品 =====
const INCLUDE_KW = [
  // 装备
  '_HEAD_', '_ARMOR_', '_SHOES_', '_CAPE', '_BAG',
  '_MAIN_', '_OFF_', '_2H_',
  '_TRINKET_',
  'PLATE_SET', 'LEATHER_SET', 'CLOTH_SET',
  // 武器关键词
  'HELLION', 'MERCENARY', 'ROYAL', 'STALKER', 'SOLDIER',
  'KNIGHT', 'CULTIST', 'DRUID', 'HUNTER', 'MAGE', 'GUARDIAN',
  'SWORD', 'AXE', 'HAMMER', 'SPEAR', 'DAGGER',
  'CROSSBOW', 'BOW',
  'STAFF', 'ARCANE', 'CURSED', 'FIRE', 'FROST', 'HOLY', 'NATURE',
  'SHIELD', 'TORCH', 'TOTEM', 'ORB', 'BOOK', 'QUARTERSTAFF',
  // 坐骑（非升级材料）
  '_MOUNT_', 'MOUNT_',
  // 药水
  'POTION',
  // 食物
  'MEAL', 'SANDWICH', 'STEW', 'PIE', 'SOUP', 'SALAD', 'OMELETTE',
];

function isValidItem(name: string): boolean {
  const u = name.toUpperCase();
  // 先排除
  if (EXCLUDE_KW.some(kw => u.includes(kw))) return false;
  // 再匹配
  return INCLUDE_KW.some(kw => u.includes(kw));
}

function getTier(name: string): number {
  if (name.length >= 2 && name[0] === 'T' && name[1] >= '0' && name[1] <= '9') return parseInt(name[1]);
  return 0;
}

/** 解析品质：UniqueName 中 @N 后缀，如 T8_2H_HALBERD@4 → quality=4 */
function getQuality(name: string): number {
  const atIdx = name.indexOf('@');
  if (atIdx >= 0) {
    const q = parseInt(name.slice(atIdx + 1));
    return isNaN(q) ? 0 : Math.min(q, 4);
  }
  return 0;
}

function parseCategory(uniqueName: string): string {
  const u = uniqueName.toUpperCase();
  if (u.includes('_HEAD_')) return '头';
  if (u.includes('_ARMOR_')) return '甲';
  if (u.includes('_SHOES_')) return '鞋';
  if (u.includes('_CAPE')) return '披风';
  if (u.includes('_MOUNT') || u.includes('MOUNT_')) return '坐骑';
  if (u.includes('POTION')) return '药水';
  if (u.includes('MEAL') || u.includes('SANDWICH') || u.includes('STEW') || u.includes('PIE') || u.includes('SOUP') || u.includes('SALAD') || u.includes('OMELETTE')) return '食物';
  if (u.includes('_OFF_') || u.includes('SHIELD') || u.includes('TORCH') || u.includes('TOTEM') || u.includes('_ORB') || u.includes('BOOK')) return '副手';
  if (u.includes('_MAIN_') || u.includes('_2H_') || u.includes('SWORD') || u.includes('AXE') || u.includes('HAMMER') || u.includes('SPEAR') || u.includes('DAGGER') || u.includes('CROSSBOW') || u.includes('BOW') || u.includes('STAFF') || u.includes('ARCANE') || u.includes('CURSED') || u.includes('FIRE') || u.includes('FROST') || u.includes('HOLY') || u.includes('NATURE') || u.includes('QUARTERSTAFF')) return '武器';
  if (u.includes('_BAG') || u.includes('_TRINKET_')) return '其他';
  return '其他';
}

async function main() {
  const minTier = parseInt(process.argv.find(a => a.startsWith('--min-tier'))?.split('=')[1] || process.argv[process.argv.indexOf('--min-tier') + 1] || '4') || 4;

  console.log(`[1/3] 从 ao-bin-dumps 下载装备数据...`);
  const resp = await fetch(ITEMS_URL, { headers: { 'User-Agent': 'kook-admin/1.0' } });
  if (!resp.ok) { console.error(`下载失败: HTTP ${resp.status}`); process.exit(1); }
  const rawData: any[] = await resp.json();
  console.log(`  原始数据: ${rawData.length} 条`);

  console.log(`[2/3] 过滤装备 (minTier=${minTier})...`);
  const items: any[] = [];
  for (const r of rawData) {
    const name = r.UniqueName;
    if (!name || !isValidItem(name)) continue;
    const tier = getTier(name);
    if (minTier > 0 && tier < minTier) continue;
    const lnames = r.LocalizedNames || {};
    const zhName = lnames['ZH-CN'] || lnames['ZH-TW'] || '';
    const enName = lnames['EN-US'] || '';
    if (!zhName && !enName) continue;
    const quality = getQuality(name);
    items.push({
      uniqueName: name,
      zhName,
      enName,
      tier,
      quality,
      gearScore: tier + quality,
      category: parseCategory(name),
      imageUrl: RENDER_URL.replace('{name}', name),
    });
  }
  console.log(`  过滤后: ${items.length} 件装备`);

  // 统计各类别数量
  const catCount: Record<string, number> = {};
  items.forEach(i => { catCount[i.category] = (catCount[i.category] || 0) + 1; });
  console.log(`  类别统计:`, catCount);

  console.log(`[3/3] 生成 SQL INSERT 语句...`);
  const sqlLines: string[] = [];
  sqlLines.push('-- Albion Online 装备参考库数据导入');
  sqlLines.push('-- 生成时间: ' + new Date().toISOString());
  sqlLines.push(`-- 共 ${items.length} 件装备 (minTier=${minTier})`);
  sqlLines.push('');
  sqlLines.push('INSERT INTO `equipment_catalog` (`name`, `albion_id`, `level`, `quality`, `category`, `gear_score`, `image_url`, `description`)');
  sqlLines.push('VALUES');

  const values = items.map(item => {
    const name = (item.zhName || item.enName).replace(/'/g, "''");
    const desc = `${item.enName} (${item.uniqueName})`.replace(/'/g, "''");
    const imageUrl = item.imageUrl.replace(/'/g, "''");
    return `  ('${name}', '${item.uniqueName}', ${item.tier || 1}, ${item.quality}, '${item.category}', ${item.gearScore}, '${imageUrl}', '${desc}')`;
  });

  sqlLines.push(values.join(',\n'));
  sqlLines.push('ON DUPLICATE KEY UPDATE');
  sqlLines.push('  `name` = VALUES(`name`),');
  sqlLines.push('  `quality` = VALUES(`quality`),');
  sqlLines.push('  `gear_score` = VALUES(`gear_score`),');
  sqlLines.push('  `image_url` = VALUES(`image_url`),');
  sqlLines.push('  `description` = VALUES(`description`);');

  const fs = await import('fs');
  const path = await import('path');
  const outPath = path.join(__dirname, '..', 'src', 'database', 'seeds', 'albion_equipment_catalog.sql');
  fs.writeFileSync(outPath, sqlLines.join('\n'), 'utf-8');
  console.log(`\n  SQL 文件已保存: ${outPath}`);
  console.log(`  装备数: ${items.length}`);
  console.log(`\n执行导入: mysql -u root kook_admin < ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });

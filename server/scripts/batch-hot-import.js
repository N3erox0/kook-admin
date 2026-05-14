/**
 * 热门装备批量入库脚本
 * 用法: cd /opt/kook-admin/server && node scripts/batch-hot-import.js [--dry-run|--execute]
 * --dry-run  (默认) 仅输出核对表，不执行入库
 * --execute  执行入库（复制官网图到热门目录+插入DB记录）
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs/promises');
const path = require('path');

const DRY_RUN = !process.argv.includes('--execute');

// ===== 装备清单定义 =====

// P8 = 44/53/62/71/80, P9 = 54/63/72/81
const P8_WITH_Q4 = [
  { level: 4, quality: 4 }, { level: 5, quality: 3 }, { level: 6, quality: 2 }, { level: 7, quality: 1 }, { level: 8, quality: 0 },
];
const P9_WITH_Q4 = [
  { level: 5, quality: 4 }, { level: 6, quality: 3 }, { level: 7, quality: 2 }, { level: 8, quality: 1 },
];
const P8_NO_Q4 = [
  { level: 5, quality: 3 }, { level: 6, quality: 2 }, { level: 7, quality: 1 }, { level: 8, quality: 0 },
];
const P9_NO_Q4 = [
  { level: 6, quality: 3 }, { level: 7, quality: 2 }, { level: 8, quality: 1 },
];
const Q1_Q3 = [{ quality: 1 }, { quality: 2 }, { quality: 3 }];

// 主手武器 P8+P9 含Q4
const WEAPONS = [
  '重型锤杖','守誓双锤','水晶锤杖','平衡铁棍','巨锤','锻造之锤',
  '堕神法杖','堕落法杖','瘟病法杖','灾荒法杖','林语者法杖','天谴法杖',
  '水晶诅咒','熊卫士拳套','无尽之剑','尖刺护手','星界法杖','赤炎镰刀',
  '血刃','正义之手大锤','卡姆兰锤杖','锤杖','生咒法杖','断水剑',
  '杰出奥术法杖','玄秘法杖','基石锤杖','黑僧棍','杰出神圣法杖',
  '裂域斧','索魂尖枪','永霜冰棱','暮歌之戒','裂隙刺刀','长弓',
  '烈狱火之手','鹭鸶长矛','塑能炮','遏怒拳刃','阿瓦隆拳套',
];

// 副手 P8+P9 含Q4
const OFFHANDS = ['号角','盾牌','血牌','茔烛','狗链','邪杖'];

// 甲 P8+P9 不含Q4
const ARMORS = [
  '守卫盔甲','骑士盔甲','恶魔盔甲','士兵盔甲','纯洁长袍','牧师长袍',
  '喧嚣甲','审判盔甲','邪教徒长袍','坚韧外套','猎人外套','风墙甲',
  '皇家外套','学士长袍','泡泡衣',
];

// 鞋 P8+P9 不含Q4
const SHOES = [
  '雇佣兵鞋子','邪教徒便鞋','布鞋','德鲁伊便鞋','皇家鞋子',
  '守墓人鞋','英勇鞋','牧师便鞋','猎人鞋','挣脱鞋','皇家便鞋',
];

// 披风：指定装等编码
const CLOAKS = {
  'Martlock披风': [[4,2],[4,3],[8,0]],
  '走私者披风': [[4,0],[4,1],[4,2],[4,3],[5,0],[5,1],[5,2],[6,1]],
  '红城Car披风': [[4,0],[4,1],[4,2],[4,3],[5,0],[5,1],[5,2],[6,1]],
  'lymhurst披风': [[4,0],[4,1],[4,2],[4,3],[5,0],[5,1],[5,2],[6,1]],
};
// 披风别名
const CLOAK_ALIASES = {
  'Martlock披风': ['马特洛克披风','Martlock Cape'],
  '红城Car披风': ['红城披风','Caerleon披风','Caerleon Cape'],
  'lymhurst披风': ['Lymhurst披风','绿城披风','Lymhurst Cape'],
  '走私者披风': ['走私者披风'],
};

// 食物 Q1~Q3
const FOODS = ['猪肉鸡蛋饼','牛肉三明治','阿瓦隆猪肉鸡蛋饼','阿瓦隆牛肉三明治','炖牛肉','沉洞螃蟹蛋饼','猪肉蛋饼'];

// 药水 Q1~Q3
const POTIONS = ['巨化药水'];

// ===== 生成完整装备清单 =====
function buildEquipmentList() {
  const list = [];

  // 主手 P8+P9 含Q4
  for (const name of WEAPONS) {
    for (const lq of [...P8_WITH_Q4, ...P9_WITH_Q4]) {
      list.push({ category: '主手', name, ...lq });
    }
  }
  // 副手 P8+P9 含Q4
  for (const name of OFFHANDS) {
    for (const lq of [...P8_WITH_Q4, ...P9_WITH_Q4]) {
      list.push({ category: '副手', name, ...lq });
    }
  }
  // 甲 P8+P9 不含Q4
  for (const name of ARMORS) {
    for (const lq of [...P8_NO_Q4, ...P9_NO_Q4]) {
      list.push({ category: '甲', name, ...lq });
    }
  }
  // 鞋 P8+P9 不含Q4
  for (const name of SHOES) {
    for (const lq of [...P8_NO_Q4, ...P9_NO_Q4]) {
      list.push({ category: '鞋', name, ...lq });
    }
  }
  // 披风
  for (const [name, combos] of Object.entries(CLOAKS)) {
    for (const [level, quality] of combos) {
      list.push({ category: '披风', name, level, quality });
    }
  }
  // 食物
  for (const name of FOODS) {
    for (const q of Q1_Q3) {
      list.push({ category: '食物', name, level: 0, ...q }); // level 后面从DB匹配
    }
  }
  // 药水
  for (const name of POTIONS) {
    for (const q of Q1_Q3) {
      list.push({ category: '药水', name, level: 0, ...q });
    }
  }

  return list;
}

// ===== 主逻辑 =====
async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  console.log(DRY_RUN ? '🔍 DRY RUN 模式（仅输出核对表）' : '🚀 EXECUTE 模式（执行入热门库）');

  // 加载所有装备参考库
  const [catalogs] = await conn.query('SELECT id,name,albion_id,level,quality,gear_score,category,aliases,image_url,local_image_path,hot_image_path FROM equipment_catalog');
  console.log(`装备参考库共 ${catalogs.length} 条`);

  // 官网图片库目录
  const officialDir = process.env.OFFICIAL_IMAGE_LIBRARY_DIR || path.join(process.cwd(), '..', 'downloads', 'official-image-library', 'ImageResources');
  let officialFiles = [];
  try {
    officialFiles = await fs.readdir(officialDir);
  } catch (e) {
    console.warn('⚠️ 官网图片库目录不存在:', officialDir);
  }
  console.log(`官网图片库共 ${officialFiles.length} 个文件`);

  const hotDir = path.join(process.cwd(), 'uploads', 'catalog-hot');
  if (!DRY_RUN) {
    await fs.mkdir(hotDir, { recursive: true });
  }

  const equipList = buildEquipmentList();
  console.log(`待入库装备组合共 ${equipList.length} 条\n`);

  // 别名映射
  const allAliases = { ...CLOAK_ALIASES };

  let matched = 0, notFound = 0, noAlbionId = 0, noOfficialImg = 0, hotSelected = 0;
  const results = [];

  for (const item of equipList) {
    const searchName = item.name;
    const searchLevel = item.level;
    const searchQuality = item.quality;

    // 在参考库中查找：按 name 精确匹配 + level + quality
    let found = catalogs.find(c =>
      c.name === searchName && c.level === searchLevel && c.quality === searchQuality
    );

    // 未找到：尝试别称匹配
    if (!found) {
      const aliases = allAliases[searchName] || [];
      for (const alias of aliases) {
        found = catalogs.find(c =>
          c.name === alias && c.level === searchLevel && c.quality === searchQuality
        );
        if (found) break;
      }
    }

    // 未找到且 level=0（食物/药水）：只按 name + quality 匹配
    if (!found && searchLevel === 0) {
      found = catalogs.find(c =>
        c.name === searchName && c.quality === searchQuality
      );
      if (!found) {
        const aliases = allAliases[searchName] || [];
        for (const alias of aliases) {
          found = catalogs.find(c => c.name === alias && c.quality === searchQuality);
          if (found) break;
        }
      }
    }

    // 未找到：尝试 aliases 字段包含搜索名
    if (!found) {
      if (searchLevel > 0) {
        found = catalogs.find(c =>
          c.aliases && c.aliases.split(',').map(a => a.trim()).includes(searchName) &&
          c.level === searchLevel && c.quality === searchQuality
        );
      } else {
        found = catalogs.find(c =>
          c.aliases && c.aliases.split(',').map(a => a.trim()).includes(searchName) &&
          c.quality === searchQuality
        );
      }
    }

    const row = {
      category: item.category,
      inputName: searchName,
      inputLQ: `${searchLevel}/${searchQuality}`,
      matchedName: found ? found.name : '❌ 未找到',
      catalogId: found ? found.id : null,
      albionId: found ? found.albion_id : null,
      gearScore: found ? found.gear_score : null,
      hasOfficialImg: false,
      officialFiles: [],
      hotImagePath: found ? found.hot_image_path : null,
      status: 'not_found',
    };

    if (!found) {
      notFound++;
      row.status = 'NOT_FOUND';
    } else if (!found.albion_id) {
      noAlbionId++;
      row.status = 'NO_ALBION_ID';
    } else {
      // 查找官网图片
      const prefix = `${found.albion_id}-Quality=`;
      const matchedFiles = officialFiles.filter(f => f.startsWith(prefix));
      row.hasOfficialImg = matchedFiles.length > 0;
      row.officialFiles = matchedFiles;

      if (matchedFiles.length === 0) {
        noOfficialImg++;
        row.status = 'NO_OFFICIAL_IMG';
      } else {
        matched++;
        row.status = found.hot_image_path ? 'ALREADY_HOT' : 'READY';
      }
    }

    results.push(row);
  }

  // 输出核对表
  console.log('========== 核对表 ==========');
  console.log(`总计: ${equipList.length} | 匹配: ${matched} | 未找到: ${notFound} | 无AlbionID: ${noAlbionId} | 无官网图: ${noOfficialImg}`);
  console.log('');

  // 未找到的装备
  const notFoundList = results.filter(r => r.status === 'NOT_FOUND');
  if (notFoundList.length > 0) {
    console.log(`--- ❌ 未找到 (${notFoundList.length}) ---`);
    for (const r of notFoundList) {
      console.log(`  ${r.category} | ${r.inputName} ${r.inputLQ}`);
    }
    console.log('');
  }

  // 无 AlbionID
  const noAidList = results.filter(r => r.status === 'NO_ALBION_ID');
  if (noAidList.length > 0) {
    console.log(`--- ⚠️ 无AlbionID (${noAidList.length}) ---`);
    for (const r of noAidList) {
      console.log(`  ${r.category} | ${r.inputName} ${r.inputLQ} → ${r.matchedName} (id=${r.catalogId})`);
    }
    console.log('');
  }

  // 就绪的
  const readyList = results.filter(r => r.status === 'READY');
  const alreadyHotList = results.filter(r => r.status === 'ALREADY_HOT');
  console.log(`--- ✅ 就绪待入库 (${readyList.length}) / 已有热门图 (${alreadyHotList.length}) ---`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN 完成。使用 --execute 参数执行入库。');
    await conn.end();
    return;
  }

  // ===== 执行入库 =====
  console.log('\n🚀 开始执行入库...');

  // 按 catalogId 去重（同一装备不同品质只执行一次）
  const catalogIdsToProcess = new Map(); // catalogId → { albionId, officialFiles }
  for (const r of [...readyList, ...alreadyHotList]) {
    if (!r.catalogId || catalogIdsToProcess.has(r.catalogId)) continue;
    catalogIdsToProcess.set(r.catalogId, {
      albionId: r.albionId,
      officialFiles: r.officialFiles,
    });
  }

  let processed = 0;
  for (const [catalogId, info] of catalogIdsToProcess) {
    processed++;
    if (processed % 50 === 0) console.log(`  进度: ${processed}/${catalogIdsToProcess.size}`);

    for (const fileName of info.officialFiles) {
      const match = fileName.match(/^(.+)-Quality=(\d+)\.(png|jpg|jpeg|webp)$/i);
      if (!match) continue;
      const parsedAlbionId = match[1];
      const itemQuality = Number(match[2]) || 0;

      if (parsedAlbionId !== info.albionId) continue;

      const safeName = fileName.replace(/[<>:"/\\|?*]/g, '_');
      const src = path.join(officialDir, fileName);
      const dest = path.join(hotDir, safeName);
      const relativePath = `/uploads/catalog-hot/${safeName}`;

      try {
        await fs.copyFile(src, dest);
      } catch { continue; }

      // 检查是否已有记录
      const [existing] = await conn.query(
        'SELECT id FROM equipment_images WHERE catalog_id=? AND image_type="hot" AND file_name=?',
        [catalogId, fileName]
      );

      if (existing.length > 0) {
        await conn.query(
          'UPDATE equipment_images SET image_url=?,albion_id=?,item_quality=?,source="official_library" WHERE id=?',
          [relativePath, parsedAlbionId, itemQuality, existing[0].id]
        );
      } else {
        await conn.query(
          'INSERT INTO equipment_images(catalog_id,image_url,image_type,file_name,is_primary,albion_id,item_quality,source) VALUES(?,?,"hot",?,0,?,?,"official_library")',
          [catalogId, relativePath, fileName, parsedAlbionId, itemQuality]
        );
      }
      hotSelected++;
    }

    // 更新 hot_image_path（取第一张）
    if (info.officialFiles.length > 0) {
      const firstName = info.officialFiles[0].replace(/[<>:"/\\|?*]/g, '_');
      await conn.query(
        'UPDATE equipment_catalog SET hot_image_path=? WHERE id=?',
        [`/uploads/catalog-hot/${firstName}`, catalogId]
      );
    }
  }

  console.log(`\n✅ 入库完成！装备 ${catalogIdsToProcess.size} 件，图片 ${hotSelected} 张`);
  await conn.end();
}

main().catch(err => { console.error('脚本执行失败:', err); process.exit(1); });

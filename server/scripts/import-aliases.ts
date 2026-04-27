/**
 * V2.9.8: 从 CSV 文件批量导入装备别称到 equipment_catalog 表
 * 
 * 用法:
 *   cd /opt/kook-admin/server
 *   npx ts-node scripts/import-aliases.ts /path/to/equipment_list.csv
 * 
 * CSV 格式: id,name,level,quality,gear_score,category,aliases
 * 只更新 aliases 非空的行，空值跳过（不覆盖已有别称）
 */
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('用法: npx ts-node scripts/import-aliases.ts <csv文件路径>');
    process.exit(1);
  }

  const fullPath = path.resolve(csvPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`文件不存在: ${fullPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  
  if (lines.length < 2) {
    console.error('CSV 文件至少需要表头和一行数据');
    process.exit(1);
  }

  // 解析表头
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  const idIdx = headers.indexOf('id');
  const aliasesIdx = headers.indexOf('aliases');

  if (idIdx < 0 || aliasesIdx < 0) {
    console.error(`CSV 必须包含 id 和 aliases 列。当前列: ${headers.join(', ')}`);
    process.exit(1);
  }

  // 解析有别称的行
  const updates: { id: number; aliases: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
    const id = parseInt(cols[idIdx]);
    const aliases = cols[aliasesIdx] || '';
    if (!id || isNaN(id)) continue;
    if (!aliases) continue; // 跳过空别称
    updates.push({ id, aliases });
  }

  console.log(`CSV 共 ${lines.length - 1} 行，有别称的 ${updates.length} 行`);

  if (updates.length === 0) {
    console.log('没有需要更新的别称数据');
    return;
  }

  // 生成 SQL 语句（也可以调 API，这里直接生成 SQL 更可靠）
  const sqlPath = path.join(path.dirname(fullPath), 'update_aliases.sql');
  const sqlLines: string[] = [
    '-- 自动生成: 批量更新 aliases 字段',
    `-- 生成时间: ${new Date().toISOString()}`,
    `-- 数据来源: ${path.basename(csvPath)}`,
    `-- 更新行数: ${updates.length}`,
    '',
  ];

  for (const u of updates) {
    const escaped = u.aliases.replace(/'/g, "''");
    sqlLines.push(`UPDATE equipment_catalog SET aliases = '${escaped}' WHERE id = ${u.id};`);
  }

  fs.writeFileSync(sqlPath, sqlLines.join('\n'), 'utf-8');
  console.log(`\nSQL 文件已生成: ${sqlPath}`);
  console.log(`请执行: mysql -u root kook_admin < ${sqlPath}`);

  // 同时输出 API 调用方式
  console.log('\n或者通过 API 批量更新（需 SSVIP 权限）:');
  console.log(`curl -X POST https://22bngm.online/api/catalog/batch-update-aliases \\`);
  console.log(`  -H "Authorization: Bearer <token>" \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"items": [...]}'`);

  // 分批输出（每批500条）
  const BATCH_SIZE = 500;
  const batches = Math.ceil(updates.length / BATCH_SIZE);
  for (let b = 0; b < batches; b++) {
    const batch = updates.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const jsonPath = path.join(path.dirname(fullPath), `aliases_batch_${b + 1}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify({ items: batch }, null, 2), 'utf-8');
    console.log(`  批次 ${b + 1}/${batches}: ${jsonPath} (${batch.length} 条)`);
  }
}

main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});

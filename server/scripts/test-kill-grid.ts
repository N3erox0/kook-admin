/**
 * V2.9.9 切图测试脚本
 * 用法: npx ts-node server/scripts/test-kill-grid.ts <击杀详情图片路径>
 * 
 * 基于固定百分比坐标切出10个装备格子，输出到 /tmp/grid-test/ 目录
 */
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const imgPath = process.argv[2];
  if (!imgPath || !fs.existsSync(imgPath)) {
    console.error('用法: npx ts-node server/scripts/test-kill-grid.ts <图片路径>');
    process.exit(1);
  }

  const sharp = require('sharp');
  const buffer = fs.readFileSync(imgPath);
  const meta = await sharp(buffer).metadata();
  const imgW = meta.width!;
  const imgH = meta.height!;
  console.log(`原图: ${imgW} x ${imgH}`);

  // ===== Step 1: 定位左面板装备区 =====
  // 击杀详情弹窗布局是固定比例的：
  // - 弹窗约占图片宽度 85%，居中
  // - 左面板占弹窗左半 45%
  // - 玩家信息区占左面板上部 ~28%
  // - 装备区占左面板下部 ~65%
  // - 底部"另存为新模板"占 ~7%
  
  // 以下百分比基于完整图片尺寸（假设击杀详情弹窗几乎占满图片）
  // 实际项目中应先用 OCR 找到"击杀详情"文字坐标做锚点
  // 这里先用固定比例测试切图效果

  // 左面板装备区（相对于整图）
  const equipAreaLeft = 0.045;   // 装备区左边界
  const equipAreaTop = 0.35;     // 装备区上边界（玩家信息区下方）
  const equipAreaWidth = 0.40;   // 装备区宽度
  const equipAreaHeight = 0.55;  // 装备区高度（到"另存为新模板"上方）

  // ===== Step 2: 10个装备格子的百分比坐标（相对于装备区） =====
  // 基于实际截图测量：
  // 行1(row0): 包/空位(col0)  头盔(col1)  披风/副手(col2)
  // 行2(row1): 主手(col0)     胸甲(col1)  副手/其他(col2)
  // 行3(row2): 披风/坐骑(col0) 鞋子(col1)  食物(col2)
  // 行4(row3): 坐骑(col1居中)

  const SLOT_W = 0.29;  // 每格宽度占装备区宽度的百分比
  const SLOT_H = 0.22;  // 每格高度占装备区高度的百分比

  // 每个格子的左上角坐标（相对装备区）
  const SLOTS = [
    // 行1
    { name: 'R1C1_包',    x: 0.02, y: 0.00, category: '其他' },
    { name: 'R1C2_头',    x: 0.35, y: 0.00, category: '头' },
    { name: 'R1C3_披风',  x: 0.68, y: 0.00, category: '披风' },
    // 行2
    { name: 'R2C1_主手',  x: 0.02, y: 0.26, category: '武器' },
    { name: 'R2C2_甲',    x: 0.35, y: 0.26, category: '甲' },
    { name: 'R2C3_副手',  x: 0.68, y: 0.26, category: '副手' },
    // 行3
    { name: 'R3C1_药水',  x: 0.02, y: 0.52, category: '药水' },
    { name: 'R3C2_鞋',    x: 0.35, y: 0.52, category: '鞋' },
    { name: 'R3C3_食物',  x: 0.68, y: 0.52, category: '食物' },
    // 行4
    { name: 'R4C2_坐骑',  x: 0.35, y: 0.78, category: '坐骑' },
  ];

  // ===== Step 3: 切图 =====
  const outDir = path.join(process.cwd(), 'tmp', 'grid-test');
  fs.mkdirSync(outDir, { recursive: true });

  // 计算装备区绝对坐标
  const areaL = Math.round(imgW * equipAreaLeft);
  const areaT = Math.round(imgH * equipAreaTop);
  const areaW = Math.round(imgW * equipAreaWidth);
  const areaH = Math.round(imgH * equipAreaHeight);

  console.log(`装备区: left=${areaL}, top=${areaT}, ${areaW}x${areaH}`);

  // 先输出装备区整体
  await sharp(buffer)
    .extract({ left: areaL, top: areaT, width: areaW, height: areaH })
    .toFile(path.join(outDir, '00_equip_area.png'));
  console.log(`已保存装备区整体: 00_equip_area.png`);

  for (let i = 0; i < SLOTS.length; i++) {
    const slot = SLOTS[i];
    const slotL = areaL + Math.round(areaW * slot.x);
    const slotT = areaT + Math.round(areaH * slot.y);
    const slotW = Math.round(areaW * SLOT_W);
    const slotH = Math.round(areaH * SLOT_H);

    // 边界检查
    const safeL = Math.max(0, Math.min(slotL, imgW - slotW));
    const safeT = Math.max(0, Math.min(slotT, imgH - slotH));
    const safeW = Math.min(slotW, imgW - safeL);
    const safeH = Math.min(slotH, imgH - safeT);

    if (safeW < 10 || safeH < 10) {
      console.log(`  ${i + 1}. ${slot.name} — 跳过（太小）`);
      continue;
    }

    const outFile = path.join(outDir, `${String(i + 1).padStart(2, '0')}_${slot.name}.png`);
    await sharp(buffer)
      .extract({ left: safeL, top: safeT, width: safeW, height: safeH })
      .toFile(outFile);
    console.log(`  ${i + 1}. ${slot.name}: (${safeL},${safeT}) ${safeW}x${safeH} → ${path.basename(outFile)}`);
  }

  // 输出带红框标注的原图
  const composites: any[] = [];
  for (const slot of SLOTS) {
    const slotL = areaL + Math.round(areaW * slot.x);
    const slotT = areaT + Math.round(areaH * slot.y);
    const slotW = Math.round(areaW * SLOT_W);
    const slotH = Math.round(areaH * SLOT_H);

    // 创建红色边框
    const borderW = 2;
    // 上边
    composites.push({
      input: await sharp({ create: { width: slotW, height: borderW, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } }).png().toBuffer(),
      left: Math.max(0, slotL), top: Math.max(0, slotT),
    });
    // 下边
    composites.push({
      input: await sharp({ create: { width: slotW, height: borderW, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } }).png().toBuffer(),
      left: Math.max(0, slotL), top: Math.min(imgH - borderW, slotT + slotH - borderW),
    });
    // 左边
    composites.push({
      input: await sharp({ create: { width: borderW, height: slotH, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } }).png().toBuffer(),
      left: Math.max(0, slotL), top: Math.max(0, slotT),
    });
    // 右边
    composites.push({
      input: await sharp({ create: { width: borderW, height: slotH, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 255 } } }).png().toBuffer(),
      left: Math.min(imgW - borderW, slotL + slotW - borderW), top: Math.max(0, slotT),
    });
  }

  await sharp(buffer)
    .composite(composites)
    .toFile(path.join(outDir, 'annotated.png'));

  console.log(`\n已保存标注图: ${path.join(outDir, 'annotated.png')}`);
  console.log(`\n请检查 ${outDir} 目录中的切图效果！`);
}

main().catch(err => { console.error(err); process.exit(1); });

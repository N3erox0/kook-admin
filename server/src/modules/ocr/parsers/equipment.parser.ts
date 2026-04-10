import { BaseOcrParser, ParsedEquipment } from './base.parser';

const ROMAN_MAP: Record<string, number> = {
  'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8,
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  '武器': ['剑', '刀', '杖', '弓', '枪', '斧', '锤', '法杖', '匕首', '长矛'],
  '副手': ['盾', '书', '魔导', '箭袋', '圣物', '副手'],
  '头': ['盔', '帽', '冠', '头盔', '头巾', '兜鍪'],
  '甲': ['甲', '铠', '袍', '衣', '胸甲', '法袍', '皮甲'],
  '鞋': ['靴', '鞋', '履'],
  '坐骑': ['马', '骑', '龙', '飞', '坐骑', '鹰', '虎'],
  '披风': ['披风', '斗篷', '肩', '披肩'],
  '药水': ['药水', '药剂', '瓶', '灵药'],
  '食物': ['肉', '面包', '果', '鱼', '饭', '食物', '馒头'],
};

export class EquipmentParser extends BaseOcrParser {
  supports(imageType: string): boolean {
    return imageType === 'equipment' || imageType === 'default';
  }

  parse(ocrTexts: string[]): ParsedEquipment[] {
    const results: ParsedEquipment[] = [];
    for (const text of ocrTexts) {
      const lines = text.split('\n').filter((l) => l.trim());
      for (const line of lines) {
        const parsed = this.parseLine(line.trim());
        if (parsed) results.push(parsed);
      }
    }
    return results;
  }

  private parseLine(line: string): ParsedEquipment | null {
    if (line.length < 2 || line.length > 100) return null;

    let name = line;
    let level: number | undefined;
    let quality: number | undefined;
    let quantity: number | undefined;
    let confidence = 0.5;

    // 1. 提取等级（罗马数字）
    for (const [roman, num] of Object.entries(ROMAN_MAP)) {
      const idx = line.indexOf(roman);
      if (idx >= 0) {
        level = num;
        name = name.replace(roman, '').trim();
        confidence += 0.1;
        break;
      }
    }

    // 2. 提取数量（末尾数字 x99 或 ×99 或纯数字）
    const qtyMatch = name.match(/[xX×](\d+)\s*$/);
    if (qtyMatch) {
      quantity = parseInt(qtyMatch[1]);
      name = name.replace(qtyMatch[0], '').trim();
      confidence += 0.1;
    } else {
      const endNum = name.match(/\s+(\d+)\s*$/);
      if (endNum) {
        quantity = parseInt(endNum[1]);
        name = name.replace(endNum[0], '').trim();
      }
    }

    // 3. 提取品质（数字 0~4，通常出现在名称后）
    const qualityMatch = name.match(/[品质]?\s*[：:]?\s*([0-4])\s*$/);
    if (qualityMatch) {
      quality = parseInt(qualityMatch[1]);
      name = name.replace(qualityMatch[0], '').trim();
      confidence += 0.1;
    }

    // 4. 清理名称
    name = name.replace(/[【】\[\]()（）]/g, '').trim();
    if (!name || name.length < 1) return null;

    // 5. 自动识别部位
    const category = this.detectCategory(name);
    if (category) confidence += 0.1;

    // 6. 计算装等
    const gearScore = (level || 0) + (quality || 0);

    return {
      name,
      level: level || undefined,
      quality: quality !== undefined ? quality : undefined,
      category: category || undefined,
      gearScore: gearScore > 0 ? gearScore : undefined,
      quantity: quantity || 1,
      confidence: Math.min(confidence, 1.0),
    };
  }

  private detectCategory(name: string): string | null {
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const kw of keywords) {
        if (name.includes(kw)) return cat;
      }
    }
    return null;
  }
}

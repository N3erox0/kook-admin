import { BaseOcrParser, ParsedEquipment } from './base.parser';

const ROMAN_MAP: Record<string, number> = {
  'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5, 'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8,
  'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
};

/**
 * 装备文本解析器
 * 仅负责从 OCR 文字中提取：装备名称、等级、数量、品质
 * 部位(category)不再通过关键词推断，完全依赖装备参考库匹配带出
 */
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
        confidence += 0.15;
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
      confidence += 0.15;
    }

    // 4. 清理名称（移除括号等干扰字符）
    name = name.replace(/[【】\[\]()（）]/g, '').trim();
    if (!name || name.length < 1) return null;

    // 5. 计算装等（部位不再由解析器推断，完全依赖参考库匹配）
    const gearScore = (level || 0) + (quality || 0);

    return {
      name,
      level: level || undefined,
      quality: quality !== undefined ? quality : undefined,
      // category 不再设置，由 enrichWithCatalog 从参考库带出
      gearScore: gearScore > 0 ? gearScore : undefined,
      quantity: quantity || 1,
      confidence: Math.min(confidence, 1.0),
    };
  }
}

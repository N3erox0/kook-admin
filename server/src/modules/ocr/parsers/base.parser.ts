export interface ParsedEquipment {
  name: string;
  level?: number;       // 1~8
  quality?: number;     // 0~4
  category?: string;    // 部位
  gearScore?: number;   // 装等
  quantity?: number;
  confidence: number;   // 0~1
  catalogId?: number;       // 匹配到的 catalog ID
  catalogName?: string;     // catalog 中的标准名称
  matchScore?: number;      // 匹配分数 0~1
}

export abstract class BaseOcrParser {
  abstract parse(ocrTexts: string[]): ParsedEquipment[];
  abstract supports(imageType: string): boolean;
}

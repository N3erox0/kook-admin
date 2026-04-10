import { IsString, IsOptional, IsNumber } from 'class-validator';

export class OcrResultItemDto {
  name: string;
  quality?: string;
  quantity?: number;
  enhancementLevel?: number;
  confidence: number;
}

export class ConfirmOcrDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  quality?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  enhancementLevel?: number;

  @IsNumber()
  memberId: number;

  @IsNumber()
  typeId: number;

  @IsOptional()
  @IsString()
  screenshotUrl?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}

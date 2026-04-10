import { IsString, IsOptional, IsNumber, IsInt, IsArray, Min } from 'class-validator';

export class QueryInventoryDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsNumber() level?: number;
  @IsOptional() @IsNumber() quality?: number;
  @IsOptional() @IsNumber() gearScore?: number;
  @IsOptional() @IsString() category?: string;
}

export class UpsertInventoryDto {
  @IsInt() catalogId: number;
  @IsInt() @Min(0) quantity: number;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() remark?: string;
}

export class BatchUpsertInventoryDto {
  @IsArray() items: UpsertInventoryDto[];
}

export class AdjustQuantityDto {
  @IsInt() delta: number; // 正数增加，负数减少
  @IsOptional() @IsString() remark?: string;
}

export class UpdateInventoryFieldDto {
  @IsOptional() @IsInt() @Min(0) quantity?: number;
  @IsOptional() @IsString() location?: string;
}

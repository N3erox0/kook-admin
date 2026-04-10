import { IsString, IsOptional, IsInt, Min, Max, IsNumber, IsArray } from 'class-validator';

export class CreateCatalogDto {
  @IsString() name: string;
  @IsInt() @Min(1) @Max(8) level: number;
  @IsInt() @Min(0) @Max(4) quality: number;
  @IsString() category: string;
  @IsOptional() @IsInt() gearScore?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdateCatalogDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsInt() quality?: number;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() gearScore?: number;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() description?: string;
}

export class QueryCatalogDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsNumber() level?: number;
  @IsOptional() @IsNumber() quality?: number;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() gearScore?: number;
}

export class BatchCreateCatalogDto {
  @IsArray() items: CreateCatalogDto[];
}

export class BatchMatchCatalogDto {
  @IsArray() items: { name: string; level: number; quality: number }[];
}

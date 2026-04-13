import { IsString, IsOptional, IsNumber, IsInt, IsArray, Min } from 'class-validator';

export class CreateResupplyDto {
  @IsOptional() @IsInt() guildMemberId?: number;
  @IsOptional() @IsString() kookUserId?: string;
  @IsOptional() @IsString() kookNickname?: string;
  @IsString() equipmentName: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsInt() quality?: number;
  @IsOptional() @IsInt() gearScore?: number;
  @IsOptional() @IsString() category?: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() screenshotUrl?: string;
  @IsOptional() @IsString() kookMessageId?: string;
  @IsOptional() @IsString() killDate?: string;
  @IsOptional() @IsString() mapName?: string;
  @IsOptional() @IsString() gameId?: string;
}

export class ProcessResupplyDto {
  @IsString() action: string; // 'approve' | 'reject' | 'dispatch'
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsInt() dispatchQuantity?: number;
}

export class UpdateResupplyFieldsDto {
  @IsOptional() @IsString() equipmentName?: string;
  @IsOptional() @IsInt() level?: number;
  @IsOptional() @IsInt() quality?: number;
  @IsOptional() @IsInt() gearScore?: number;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsInt() quantity?: number;
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() reason?: string;
}

export class BatchProcessDto {
  @IsArray() ids: number[];
  @IsString() action: string;
  @IsOptional() @IsString() remark?: string;
}

export class QueryResupplyDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsNumber() status?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
}

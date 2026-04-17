import { IsString, IsOptional, IsNumber, IsInt, IsArray } from 'class-validator';

export class CreateResupplyDto {
  @IsOptional() @IsInt() guildMemberId?: number;
  @IsOptional() @IsString() kookUserId?: string;
  @IsOptional() @IsString() kookNickname?: string;
  @IsOptional() @IsString() equipmentIds?: string; // 逗号分隔的 catalog ID，如 "11731,11481,10033"
  @IsOptional() @IsInt() quantity?: number; // 总数量（默认=ID个数）
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() screenshotUrl?: string;
  @IsOptional() @IsString() kookMessageId?: string;
  @IsOptional() @IsString() killDate?: string;
  @IsOptional() @IsString() mapName?: string;
  @IsOptional() @IsString() gameId?: string;
  @IsOptional() @IsString() resupplyBox?: string;
}

export class ProcessResupplyDto {
  @IsString() action: string; // 'approve' | 'reject' | 'dispatch'
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsInt() dispatchQuantity?: number;
}

export class UpdateResupplyFieldsDto {
  @IsOptional() @IsString() equipmentIds?: string;
  @IsOptional() @IsInt() quantity?: number;
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() resupplyBox?: string;
  @IsOptional() @IsString() resupplyRoom?: string;
}

export class BatchProcessDto {
  @IsArray() ids: number[];
  @IsString() action: string;
  @IsOptional() @IsString() remark?: string;
}

export class BatchAssignRoomDto {
  @IsArray() ids: number[];
  @IsString() room: string;
}

export class QueryResupplyDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsNumber() status?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() room?: string;
}

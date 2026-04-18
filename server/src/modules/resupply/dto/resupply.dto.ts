import { IsString, IsOptional, IsNumber, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** 装备项（含数量） — F-103 */
export class EquipmentEntryDto {
  @IsInt() catalogId: number;
  @IsOptional() @IsInt() quantity?: number; // 默认=1
}

export class CreateResupplyDto {
  @IsOptional() @IsInt() guildMemberId?: number;
  @IsOptional() @IsString() kookUserId?: string;
  @IsOptional() @IsString() kookNickname?: string;
  @IsOptional() @IsString() equipmentIds?: string; // 兼容字段：逗号分隔的 catalog ID（展开后的，如 "11731,11731,11481"）
  /** F-103: 新版结构 - 支持每件装备指定数量 */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EquipmentEntryDto)
  equipmentEntries?: EquipmentEntryDto[];
  @IsOptional() @IsInt() quantity?: number; // 总数量（默认=ID个数，或 entries 数量之和）
  @IsOptional() @IsString() applyType?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() screenshotUrl?: string;
  @IsOptional() @IsString() kookMessageId?: string;
  @IsOptional() @IsString() killDate?: string;
  @IsOptional() @IsString() mapName?: string;
  @IsOptional() @IsString() gameId?: string;
  @IsOptional() @IsString() resupplyBox?: string;
}

/** F-108: 快捷补装完成（一步到位：更新装备列表 + 直接扣库存 + 标记完成） */
export class QuickCompleteResupplyDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EquipmentEntryDto)
  equipmentEntries?: EquipmentEntryDto[];
  @IsOptional() @IsString() equipmentIds?: string; // 兼容逗号分隔写法（展开后的）
  @IsOptional() @IsString() remark?: string;
  @IsOptional() @IsString() killDate?: string;
  @IsOptional() @IsString() mapName?: string;
  @IsOptional() @IsString() gameId?: string;
  @IsOptional() @IsString() resupplyBox?: string;
  @IsOptional() @IsString() kookNickname?: string;
}

/** F-108: 批量废弃（将多条补装申请标记为 rejected） */
export class BatchRejectDto {
  @IsArray() ids: number[];
  @IsOptional() @IsString() remark?: string;
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

import { IsString, IsOptional, IsNumber } from 'class-validator';

export class QueryMemberDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() status?: string; // 'all' | 'active' | 'left'
  /** F-101: KOOK 角色ID过滤（匹配 kook_roles JSON 字段中的 role_id） */
  @IsOptional() @IsString() kookRoleId?: string;
}

export class UpdateMemberRoleDto {
  @IsString() role: string;
}

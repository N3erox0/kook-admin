import { IsString, IsOptional, IsNumber } from 'class-validator';

export class QueryMemberDto {
  @IsOptional() @IsNumber() page?: number;
  @IsOptional() @IsNumber() pageSize?: number;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() status?: string; // 'all' | 'active' | 'left'
}

export class UpdateMemberRoleDto {
  @IsString() role: string;
}

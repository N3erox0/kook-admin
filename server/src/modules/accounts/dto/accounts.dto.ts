import { IsString, IsOptional, IsInt, IsIn, MinLength, MaxLength } from 'class-validator';

/** V3.2 创建手动登录账号 */
export class CreateAccountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  /** 系统角色（公会维度） */
  @IsString()
  @IsIn(['super_admin', 'inventory_admin', 'resupply_staff', 'normal'])
  role: string;
}

/** 更新账号 */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @IsIn(['super_admin', 'inventory_admin', 'resupply_staff', 'normal'])
  role?: string;

  @IsOptional()
  @IsInt()
  @IsIn([0, 1])
  status?: number;
}

/** 重置密码 */
export class ResetAccountPasswordDto {
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  newPassword: string;
}

/** 列表查询 */
export class QueryAccountsDto {
  @IsOptional()
  page?: number;
  @IsOptional()
  pageSize?: number;
  @IsOptional()
  @IsString()
  keyword?: string;
  /** 账号来源筛选 */
  @IsOptional()
  @IsString()
  source?: string;
}

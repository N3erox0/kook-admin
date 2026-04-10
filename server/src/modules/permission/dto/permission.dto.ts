import { IsString, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AssignPermissionsDto {
  @IsArray()
  @IsNumber({}, { each: true })
  permissionIds: number[];
}

export class AssignRolesDto {
  @IsNumber()
  userId: number;

  @IsArray()
  @IsNumber({}, { each: true })
  roleIds: number[];
}

import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== 邀请码 =====
export class ValidateInviteCodeDto {
  @ApiProperty({ description: '邀请码' })
  @IsString() code: string;
}

export class GenerateInviteCodesDto {
  @ApiProperty({ description: '生成数量', minimum: 1, maximum: 100 })
  @IsInt() @Min(1) @Max(100) count: number;

  @ApiPropertyOptional({ description: '前缀' })
  @IsOptional() @IsString() prefix?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional() @IsString() remark?: string;
}

export class UpdateInviteCodeStatusDto {
  @ApiProperty({ description: '新状态', enum: ['enabled', 'disabled', 'revoked'] })
  @IsString()
  @IsIn(['enabled', 'disabled', 'revoked'])
  status: string;
}

// ===== 公会 =====
export class CreateGuildDto {
  @ApiProperty({ description: '邀请码' })
  @IsString() inviteCode: string;

  @ApiProperty({ description: '公会名称' })
  @IsString() name: string;

  @ApiPropertyOptional({ description: '公会图标URL' })
  @IsOptional() @IsString() iconUrl?: string;

  @ApiProperty({ description: 'KOOK服务器ID' })
  @IsString() kookGuildId: string;
}

export class UpdateGuildDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() iconUrl?: string;
  @IsOptional() @IsString() kookBotToken?: string;
  @IsOptional() @IsString() kookVerifyToken?: string;
  @IsOptional() @IsString() kookResupplyChannelId?: string;
  @IsOptional() @IsString() kookAdminChannelId?: string;
  @IsOptional() @IsString() kookAdminRoleId?: string;
  @IsOptional() @IsArray() kookListenChannelIds?: string[];
}

export class UpdateMemberRoleDto {
  @IsInt() memberId: number;
  @IsString() role: string;
}

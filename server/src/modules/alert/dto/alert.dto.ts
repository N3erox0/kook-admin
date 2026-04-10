import { IsString, IsOptional, IsInt, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAlertRuleDto {
  @ApiProperty({ description: '规则类型', enum: ['01', '02'] })
  @IsString() @IsIn(['01', '02']) ruleType: string;

  @ApiProperty({ description: '规则名称' })
  @IsString() ruleName: string;

  @ApiPropertyOptional({ description: '装备名称' })
  @IsOptional() @IsString() equipmentName?: string;

  @ApiPropertyOptional({ description: '装等值（如P8、P9、P12）' })
  @IsOptional() @IsString() gearScoreValue?: string;

  @ApiPropertyOptional({ description: '装等下限' })
  @IsOptional() @IsInt() gearScoreMin?: number;

  @ApiPropertyOptional({ description: '装等上限' })
  @IsOptional() @IsInt() gearScoreMax?: number;

  @ApiProperty({ description: '阈值' })
  @IsInt() threshold: number;
}

export class UpdateAlertRuleDto {
  @IsOptional() @IsString() @IsIn(['01', '02']) ruleType?: string;
  @IsOptional() @IsString() ruleName?: string;
  @IsOptional() @IsString() equipmentName?: string;
  @IsOptional() @IsString() gearScoreValue?: string;
  @IsOptional() @IsInt() gearScoreMin?: number;
  @IsOptional() @IsInt() gearScoreMax?: number;
  @IsOptional() @IsInt() threshold?: number;
  @IsOptional() @IsInt() enabled?: number;
}

export class QueryAlertRecordDto {
  @IsOptional() page?: number;
  @IsOptional() pageSize?: number;
  @IsOptional() isResolved?: number;
  @IsOptional() @IsString() alertType?: string;
}

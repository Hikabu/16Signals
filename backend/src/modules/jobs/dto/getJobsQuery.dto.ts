import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { RoleType, Seniority } from '@prisma/client';

export class GetJobsQueryDto {
  @ApiPropertyOptional({
    description: 'Search in job title and description',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Role type required for the job',
    enum: RoleType,
  })
  @IsOptional()
  @IsEnum(RoleType)
  @Transform(({ value }) => value?.toUpperCase())
  roleType?: RoleType;

  @ApiPropertyOptional({
    description: 'Seniority level required',
    enum: Seniority,
  })
  @IsOptional()
  @IsEnum(Seniority)
  @Transform(({ value }) => value?.toUpperCase())
  seniority?: Seniority;

  @ApiPropertyOptional({
    description: 'Filter Web3 jobs',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isWeb3?: boolean;

  @ApiPropertyOptional({
    description: 'Filter jobs with escrow paid',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isEscrowFunded?: boolean;

  @ApiPropertyOptional({
    description: 'Filter jobs by companies with Verified employer history',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  isVerifiedPayer?: boolean;

  @ApiPropertyOptional({
    description: 'Page number (default: 1)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page (max: 50)',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}

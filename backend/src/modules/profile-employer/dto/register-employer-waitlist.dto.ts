import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
} from 'class-validator';

export class RegisterEmployerWaitlistDto {
  @ApiProperty({ example: 'hiring@acme.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Acme Corp' })
  @IsString()
  companyName: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional()
  @IsString()
  website?: string;

  // ── Step 2 ICP signals (all optional) ──────────────────────────────────────

  @ApiPropertyOptional({ type: [String], example: ['Frontend Developer', 'Designer'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rolesHiring?: string[];

  @ApiPropertyOptional({ example: 'Legal, Finance, Operations' })
  @IsOptional()
  @IsString()
  otherRolesText?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  usesGithub?: boolean;

  @ApiPropertyOptional({ example: 'Greenhouse, Notion, Loom' })
  @IsOptional()
  @IsString()
  evalTools?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  needsOtherRoleTools?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['Startup', 'Web3 / Crypto'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  companyTypes?: string[];

  @ApiPropertyOptional({ example: '11–50' })
  @IsOptional()
  @IsString()
  teamSize?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/in/jane' })
  @IsOptional()
  @IsString()
  socialLinks?: string;
}

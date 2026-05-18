import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RegisterNonDevWaitlistDto {
  @ApiProperty({ example: 'jane@company.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'Jane Smith' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Designer' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'Operations Manager' })
  @IsOptional()
  @IsString()
  otherRole?: string;

  @ApiPropertyOptional({ example: 'Figma, Notion, Linear, Salesforce' })
  @IsOptional()
  @IsString()
  tools?: string;
}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const CreateAnalysisSchema = z
  .object({
    githubUsername: z.string().optional(),
    walletAddress: z
      .string()
      .regex(SOLANA_ADDRESS_REGEX, 'Invalid Solana wallet address format')
      .optional(),
  })
  .refine((data) => data.githubUsername || data.walletAddress, {
    message: 'At least one of githubUsername or walletAddress is required',
    path: ['githubUsername'], // Attach error to githubUsername if both missing
  });

export class CreateAnalysisDto extends createZodDto(CreateAnalysisSchema) {}

export class RecomputeAnalysisDto {
  @ApiProperty({ example: '7b986a14-4f1b-4330-8120-f0ec4342c7ec' })
  @IsString()
  userId: string;

  @ApiProperty({ example: true })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
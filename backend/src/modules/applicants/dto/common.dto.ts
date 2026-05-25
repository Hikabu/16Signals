import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStage } from '@prisma/client';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}

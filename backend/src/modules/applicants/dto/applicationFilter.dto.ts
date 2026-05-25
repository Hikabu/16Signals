import { ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStage } from '@prisma/client';

export class ApplicationFiltersDto {
  // @ApiPropertyOptional({
  //   enum: FitTier,
  //   description: 'Filter by fit tier',
  //   example: 'STRONG',
  // })
  // fitTier?: FitTier;

  @ApiPropertyOptional({
    description: 'Minimum role fit score',
    example: 70,
  })
  minScore?: number;

  @ApiPropertyOptional({
    enum: PipelineStage,
    description: 'Filter by pipeline stage',
    example: 'INTERVIEW_HR',
  })
  pipelineStage?: PipelineStage;
}

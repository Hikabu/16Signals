import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PipelineStage } from '@prisma/client';

export class AdvanceStageDto {
  @ApiProperty({
    enum: PipelineStage,
    example: PipelineStage.INTERVIEW_HR,
    description: 'Next pipeline stage',
  })
  stage: PipelineStage;

  @ApiPropertyOptional({
    example: 'Strong communication skills',
    description: 'Optional HR note',
  })
  note?: string;
}

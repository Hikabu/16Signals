import { ApiProperty } from '@nestjs/swagger';

export class JobQueueResponseDto {
  @ApiProperty({ example: '12345', description: 'BullMQ job ID' })
  jobId: string;
}

export class JobStatusResponseDto {
  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiProperty({ example: 'queued' })
  stage: string;

  @ApiProperty({ example: 45 })
  progress: number;

  @ApiProperty({ example: null, required: false })
  failureReason?: string;
}

export class JobResultResponseDto {
  @ApiProperty({ example: 'completed' })
  status: string;

  @ApiProperty({ example: 100 })
  progress: number;

  @ApiProperty({
    description: 'Final computed analysis result',
    example: {
      summary: 'Full-stack developer with strong backend capability.',
      capabilities: {
        backend: { score: 0.82, confidence: 'high' },
        frontend: { score: 0.68, confidence: 'medium' },
        devops: { score: 0.44, confidence: 'medium' },
      },
      ownership: {
        ownedProjects: 5,
        activelyMaintained: 3,
        confidence: 'medium',
      },
      impact: {
        activityLevel: 'high',
        consistency: 'strong',
        externalContributions: 12,
        confidence: 'high',
      },
      reputation: null,
      privateWorkNote: null,
      organizations: [],
      interactionProfile: null,
      stack: {
        languages: ['TypeScript'],
        tools: ['NestJS', 'PostgreSQL'],
      },
      web3: null,
    },
    required: false,
  })
  result?: any;

  @ApiProperty({
    example: 'Some error occurred',
    required: false,
  })
  error?: string;
}

export class AnalysisErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ example: 'Bad Request' })
  error: string;
}

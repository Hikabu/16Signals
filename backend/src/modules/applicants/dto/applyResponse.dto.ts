import { ApiProperty } from '@nestjs/swagger';

export class ApplyResponseDto {
  @ApiProperty({ example: 'application_123' })
  id: string;

  @ApiProperty({ example: 'APPLIED' })
  pipelineStage: string;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({
    required: false,
    enum: ['OK', 'NEEDS_REVIEW', 'INSUFFICIENT'],
    example: 'NEEDS_REVIEW',
  })
  reviewOutcome?: 'OK' | 'NEEDS_REVIEW' | 'INSUFFICIENT';

  @ApiProperty({
    required: false,
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
      organizations: [],
      interactionProfile: null,
      stack: { languages: ['TypeScript'], tools: ['NestJS'] },
      web3: null,
    },
  })
  scorecard?: any;

  @ApiProperty({
    required: false,
    example: {
      requiredSkills: ['Rust', 'Solana'],
      matchedTechnologies: ['Solana'],
      missingTechnologies: ['Rust'],
      gaps: [{ skill: 'Rust', severity: 'DEALBREAKER' }],
    },
  })
  skillsGap?: any;
}

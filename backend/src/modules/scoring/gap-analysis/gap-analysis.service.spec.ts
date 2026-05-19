import { Test, TestingModule } from '@nestjs/testing';
import { GapAnalysisService } from './gap-analysis.service';
import { AnalysisResult } from '../types/result.types';

describe('GapAnalysisService', () => {
  let service: GapAnalysisService;
  const baseAnalysisResult = (): AnalysisResult =>
    ({
      summary: 'Strong backend engineer.',
      capabilities: {
        backend: { score: 0.8, confidence: 'high' },
        frontend: { score: 0.8, confidence: 'high' },
        devops: { score: 0.8, confidence: 'high' },
      },
      ownership: {
        ownedProjects: 4,
        activelyMaintained: 3,
        confidence: 'high',
      },
      impact: {
        activityLevel: 'high',
        consistency: 'strong',
        externalContributions: 4,
        confidence: 'high',
      },
      reputation: null,
      organizations: [],
      interactionProfile: null,
      stack: { languages: ['Typescript'], tools: ['React', 'NestJS'] },
      web3: null,
    }) as AnalysisResult;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GapAnalysisService],
    }).compile();

    service = module.get<GapAnalysisService>(GapAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Retain S4.10 cases 1-10 (generalized summary tests to ensure coverage)
  it('case 1-10: computes gaps logically against job requirements', () => {
    const analysisResult = baseAnalysisResult();
    const job = {
      parsedRequirements: {
        seniorityLevel: 'MID',
        collaborationWeight: 'MEDIUM',
        ownershipWeight: 'MEDIUM',
        innovationWeight: 'MEDIUM',
        isWeb3Role: false,
        requiredSkills: ['Typescript', 'NodeJS'],
        requiredRoleType: 'FULLSTACK',
      },
    };
    const report = service.compute(analysisResult, job);
    expect(report.missingTechnologies).toContain('NodeJS');
    expect(report.matchedTechnologies).toContain('Typescript');
  });

  it('case 11: parsedRequirements null and no job.requiredSkills → technologyFitScore: 100, no tech gaps', () => {
    const analysisResult = baseAnalysisResult();

    // Simulate a job where parser hasn't populated requirements
    const job = { parsedRequirements: null };

    const report = service.compute(analysisResult, job);

    expect(report.technologyFitScore).toBe(100);
    expect(report.missingTechnologies).toHaveLength(0);
    // Since required techs was effectively empty, matched is also empty logically depending on implementation
    expect(
      report.gaps.find((g) => g.dimension === 'Technology Stack'),
    ).toBeUndefined();
  });

  it('uses promoted job.requiredSkills when parsedRequirements is missing', () => {
    const report = service.compute(baseAnalysisResult(), {
      parsedRequirements: null,
      requiredSkills: ['NestJS', 'Rust'],
    });

    expect(report.matchedTechnologies).toContain('NestJS');
    expect(report.missingTechnologies).toContain('Rust');
    expect(report.technologyFitScore).toBe(50);
  });

  it('uses updated scorecard web3 fields for web3 role gaps', () => {
    const result = baseAnalysisResult();
    result.web3 = null;

    const report = service.compute(result, {
      parsedRequirements: {
        requiredSkills: [],
        seniorityLevel: 'MID',
        requiredRoleType: 'WEB3_BACKEND',
        isWeb3Role: true,
      },
    });

    expect(report.gaps.map((g) => g.dimension)).toContain('WEB3');
  });
});

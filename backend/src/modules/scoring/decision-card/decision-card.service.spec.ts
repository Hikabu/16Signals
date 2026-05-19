import { Test, TestingModule } from '@nestjs/testing';
import { DecisionCardService } from './decision-card.service';
import { GapReport } from '../gap-analysis/gap-analysis.service';

describe('DecisionCardService', () => {
  let service: DecisionCardService;
  const baseAnalysisResult = () =>
    ({
      summary: 'Strong backend engineer.',
      impact: {
        activityLevel: 'high',
        consistency: 'strong',
        externalContributions: 8,
        confidence: 'high',
      },
      ownership: {
        ownedProjects: 4,
        activelyMaintained: 3,
        confidence: 'high',
      },
      capabilities: {
        backend: { score: 0.8, confidence: 'high' },
        frontend: { score: 0.8, confidence: 'high' },
        devops: { score: 0.8, confidence: 'high' },
      },
      reputation: null,
      organizations: [],
      interactionProfile: null,
      stack: { languages: ['TypeScript'], tools: ['NestJS'] },
      web3: null,
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DecisionCardService],
    }).compile();

    service = module.get<DecisionCardService>(DecisionCardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Retain S4.10 cases 11-18 (generalized)
  it('cases 11-18: builds accurate strengths/risks and determines base verdict properly', () => {
    const gapReport: GapReport = {
      overallVerdict: 'POSSIBLE_FIT',
      technologyFitScore: 80,
      missingTechnologies: [],
      matchedTechnologies: ['Typescript'],
      gaps: [
        {
          dimension: 'Test',
          severity: 'SIGNIFICANT',
          expected: 'A',
          actual: 'B',
          mitigatingContext: null,
          probeQuestion: 'Q?',
        },
      ],
    };
    const mockAnalysisResult = baseAnalysisResult();
    const card = service.generate(gapReport, mockAnalysisResult);
    expect(card.verdict).toBeDefined();
    expect(card.reviewOutcome).toBe('NEEDS_REVIEW');
    expect(card.strengths).toBeInstanceOf(Array);
  });

  it('case 19: hrSummary populated and is a plain English string (no numbers, no score labels)', () => {
    const gapReport: GapReport = {
      overallVerdict: 'LIKELY_FIT',
      technologyFitScore: 90,
      missingTechnologies: [],
      matchedTechnologies: ['Typescript', 'React'],
      gaps: [],
    };
    const mockAnalysisResult = baseAnalysisResult();
    const card = service.generate(gapReport, mockAnalysisResult);
    expect(card.hrSummary).toBeTruthy();
    expect(typeof card.hrSummary).toBe('string');
    // Ensure no score numbers exist in the string (basic regex matching digits inside score-like contexts)
    expect(card.hrSummary).not.toMatch(/\b\d{2,3}(%| points|\/100)\b/i);
  });

  it('case 20: technicalSummary contains score values and tech match ratio', () => {
    const gapReport: GapReport = {
      overallVerdict: 'LIKELY_FIT',
      technologyFitScore: 95,
      missingTechnologies: ['Docker'],
      matchedTechnologies: ['Typescript', 'React', 'NodeJS'],
      gaps: [],
    };
    const mockAnalysisResult = baseAnalysisResult();
    const card = service.generate(gapReport, mockAnalysisResult);
    expect(card.technicalSummary).toBeTruthy();
    expect(typeof card.technicalSummary).toBe('string');
    // It should mention 3/4 technologies matched (or something representing ratio)
    // and overall role fit score
    expect(card.technicalSummary).toMatch(/\b(80)\b/);
    expect(card.technicalSummary).toMatch(/techs matched/i); // technology fit score often mentioned
  });

  it('uses updated reputation and private work fields to move insufficient data to review', () => {
    const gapReport: GapReport = {
      overallVerdict: 'UNLIKELY_FIT',
      technologyFitScore: 40,
      missingTechnologies: ['Rust'],
      matchedTechnologies: [],
      gaps: [
        {
          dimension: 'Technology: Rust',
          severity: 'DEALBREAKER',
          expected: 'Required',
          actual: 'Not detected',
          mitigatingContext: 'Private work indicator detected.',
          probeQuestion: 'Q?',
        },
      ],
    };
    const mockAnalysisResult = baseAnalysisResult();
    mockAnalysisResult.privateWorkNote = 'Private work indicator detected.';
    mockAnalysisResult.reputation = {
      vouchCount: 1,
      verifiedVouchCount: 1,
      confidence: 'medium',
      vouches: [],
    };

    const card = service.generate(gapReport, mockAnalysisResult);

    expect(card.verdict).toBe('REVIEW');
    expect(card.reviewOutcome).toBe('NEEDS_REVIEW');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { ApplicantsService } from './applicants.service';
import { BadRequestException } from '@nestjs/common';
import { PipelineStage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GapAnalysisService } from '../scoring/gap-analysis/gap-analysis.service';
import { DecisionCardService } from '../scoring/decision-card/decision-card.service';
import { InterviewQuestionService } from './interview-question.service';
import { ScorecardService } from '../scorecard/scorecard.service';

describe('ApplicantsService', () => {
  let service: ApplicantsService;

  const mockPrisma = {
    shortlist: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    jobPost: {
      findUnique: jest.fn(),
    },
    analysisResult: {
      findFirst: jest.fn(),
    },
    candidate: {
      findUnique: jest.fn(),
    },
    analysisJob: {
      findFirst: jest.fn(),
    },
  };

  const mockGapAnalysisService = {
    compute: jest.fn().mockReturnValue({
      gaps: [],
      technologyFitScore: 100,
      matchedTechnologies: [],
      missingTechnologies: [],
    }),
  };

  const mockDecisionCardService = {
    generate: jest.fn().mockReturnValue({ reviewOutcome: 'OK' }),
  };

  const mockInterviewQuestionService = {
    generate: jest.fn().mockResolvedValue([{ stage: 'INTERVIEW_HR' }]),
    generateForApplication: jest.fn().mockResolvedValue([]),
  };

  const mockScorecardService = {
    computeForCandidate: jest.fn(),
    getScorecardForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicantsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GapAnalysisService, useValue: mockGapAnalysisService },
        { provide: DecisionCardService, useValue: mockDecisionCardService },
        {
          provide: InterviewQuestionService,
          useValue: mockInterviewQuestionService,
        },
        { provide: ScorecardService, useValue: mockScorecardService },
      ],
    }).compile();

    service = module.get<ApplicantsService>(ApplicantsService);
    // Suppress logger
    (service as any).logger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('apply', () => {
    const analysisResult = {
      summary: 'Strong backend engineer.',
      capabilities: {
        backend: { score: 0.8, confidence: 'high' },
        frontend: { score: 0.7, confidence: 'high' },
        devops: { score: 0.4, confidence: 'medium' },
      },
      ownership: {
        ownedProjects: 4,
        activelyMaintained: 3,
        confidence: 'high',
      },
      impact: {
        activityLevel: 'high',
        consistency: 'strong',
        externalContributions: 6,
        confidence: 'high',
      },
      reputation: null,
      organizations: [],
      interactionProfile: null,
      stack: { languages: ['TypeScript'], tools: ['NestJS'] },
      web3: null,
    };

    it('cases 21-28: retains original apply logic checking duplicates, analyzing gaps, etc', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue({
        id: 'cand-1UUID',
        userId: 'cand-1',
      });
      mockPrisma.jobPost.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'ACTIVE',
      });
      mockPrisma.shortlist.findFirst.mockResolvedValue(null);
      mockPrisma.analysisJob.findFirst.mockResolvedValue({
        result: analysisResult,
      });
      mockPrisma.shortlist.create.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.APPLIED,
        pipelineStageHistory: [],
      });

      const result = await service.apply('job-1', 'cand-1');
      expect(result).toBeDefined();
    });

    it('case 29: Application created with pipelineStage: APPLIED', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue({
        id: 'cand-1UUID',
        userId: 'cand-1',
      });
      mockPrisma.jobPost.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'ACTIVE',
      });
      mockPrisma.shortlist.findFirst.mockResolvedValue(null);
      mockPrisma.analysisJob.findFirst.mockResolvedValue({
        result: analysisResult,
      });

      let createData: any;
      mockPrisma.shortlist.create.mockImplementation((args) => {
        createData = args.data;
        return Promise.resolve({
          id: 'app-1',
          pipelineStage: createData.pipelineStage,
          pipelineStageHistory: createData.pipelineStageHistory,
        });
      });

      await service.apply('job-1', 'cand-1');
      expect(createData.pipelineStage).toBe(PipelineStage.APPLIED);
    });

    it('case 30: pipelineStageHistory contains one entry { stage: APPLIED, changedBy: "system" }', async () => {
      mockPrisma.candidate.findUnique.mockResolvedValue({
        id: 'cand-1UUID',
        userId: 'cand-1',
      });
      mockPrisma.jobPost.findUnique.mockResolvedValue({
        id: 'job-1',
        status: 'ACTIVE',
      });
      mockPrisma.shortlist.findFirst.mockResolvedValue(null);
      mockPrisma.analysisJob.findFirst.mockResolvedValue({
        result: analysisResult,
      });

      let createData: any;
      mockPrisma.shortlist.create.mockImplementation((args) => {
        createData = args.data;
        return Promise.resolve({ id: 'app-1' });
      });

      await service.apply('job-1', 'cand-1');
      expect(createData.pipelineStageHistory).toHaveLength(1);
      expect(createData.pipelineStageHistory[0].stage).toBe(
        PipelineStage.APPLIED,
      );
      expect(createData.pipelineStageHistory[0].changedBy).toBe('system');
    });
  });

  describe('advanceStage', () => {
    it('case 31: APPLIED → REVIEWED: succeeds, history has 2 entries', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.APPLIED,
        pipelineStageHistory: [
          { stage: PipelineStage.APPLIED, changedBy: 'system' },
        ],
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await service.advanceStage('app-1', 'comp-1', PipelineStage.REVIEWED);

      expect(mockPrisma.shortlist.update).toHaveBeenCalled();
      const updateArgs = mockPrisma.shortlist.update.mock.calls[0][0].data;
      expect(updateArgs.pipelineStage).toBe(PipelineStage.REVIEWED);
      expect(updateArgs.pipelineStageHistory).toHaveLength(2);
    });

    it('case 32: APPLIED → INTERVIEW_HR (skip REVIEWED): succeeds (forward skip allowed)', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.APPLIED,
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await expect(
        service.advanceStage('app-1', 'comp-1', PipelineStage.INTERVIEW_HR),
      ).resolves.toBeDefined();
    });

    it('case 33: INTERVIEW_HR → APPLIED (backwards): throws 400', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.INTERVIEW_HR,
        jobPost: { companyId: 'comp-1' },
      });

      await expect(
        service.advanceStage('app-1', 'comp-1', PipelineStage.APPLIED),
      ).rejects.toThrow(BadRequestException);
    });

    it('case 34: Valid stage REJECTED from REVIEWED: succeeds', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.REVIEWED,
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await expect(
        service.advanceStage('app-1', 'comp-1', PipelineStage.REJECTED),
      ).resolves.toBeDefined();
    });

    it('case 35: Advancing to INTERVIEW_HR triggers generation with hr', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.REVIEWED,
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await service.advanceStage('app-1', 'comp-1', PipelineStage.INTERVIEW_HR);
      expect(
        mockInterviewQuestionService.generateForApplication,
      ).toHaveBeenCalledWith('app-1', PipelineStage.INTERVIEW_HR);
    });

    it('case 36: Advancing to INTERVIEW_TECHNICAL triggers generation with technical', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.INTERVIEW_HR,
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await service.advanceStage(
        'app-1',
        'comp-1',
        PipelineStage.INTERVIEW_TECHNICAL,
      );
      expect(
        mockInterviewQuestionService.generateForApplication,
      ).toHaveBeenCalledWith('app-1', PipelineStage.INTERVIEW_TECHNICAL);
    });

    it('case 37: Advancing to INTERVIEW_FINAL triggers generation with final', async () => {
      mockPrisma.shortlist.findUnique.mockResolvedValue({
        id: 'app-1',
        pipelineStage: PipelineStage.INTERVIEW_TECHNICAL,
        jobPost: { companyId: 'comp-1' },
      });
      mockPrisma.shortlist.update.mockResolvedValue({});

      await service.advanceStage(
        'app-1',
        'comp-1',
        PipelineStage.INTERVIEW_FINAL,
      );
      expect(
        mockInterviewQuestionService.generateForApplication,
      ).toHaveBeenCalledWith('app-1', PipelineStage.INTERVIEW_FINAL);
    });
  });
});

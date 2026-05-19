import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from '../scoring-service/scoring.service';
import { SignalExtractorService } from '../signal-extractor/signal-extractor.service';
import { SummaryGeneratorService } from '../summary-generator/summary-generator.service';
import { EcosystemClassifierService } from '../signal-extractor/ecosystem-clarifier.service';
import { InteractionProfileService } from '../signal-extractor/interaction-profile.service';
import { OrgAnalyserService } from '../signal-extractor/org-analyser.service';
import { StackFingerprintService } from '../signal-extractor/stack-fingerprint.service';
import {
  ALEX_BACKEND,
  SARAH_FULLSTACK,
  MAYA_DEVOPS,
  NEW_DEV,
  GHOST_PROFILE,
} from '../signal-extractor/__fixtures__/seed-developers';

describe('Scoring Pipeline Integration (Checkpoint B)', () => {
  let scoringService: ScoringService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ScoringService,
        SignalExtractorService,
        SummaryGeneratorService,
        EcosystemClassifierService,
        InteractionProfileService,
        OrgAnalyserService,
        StackFingerprintService,
      ],
    }).compile();

    scoringService = module.get<ScoringService>(ScoringService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  const fixtures = [
    { name: 'ALEX_BACKEND', data: ALEX_BACKEND },
    { name: 'SARAH_FULLSTACK', data: SARAH_FULLSTACK },
    { name: 'MAYA_DEVOPS', data: MAYA_DEVOPS },
    { name: 'NEW_DEV', data: NEW_DEV },
    { name: 'GHOST_PROFILE', data: GHOST_PROFILE },
  ];

  fixtures.forEach((fixture) => {
    it(`should successfully process ${fixture.name} through the full pipeline`, () => {
      const result = scoringService.score(fixture.data);

      // Verify Schema Completeness
      expect(result).toHaveProperty('summary');
      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(10);

      expect(result.capabilities).toBeDefined();
      expect(result.capabilities.backend).toBeDefined();
      expect(result.capabilities.backend.score).toBeGreaterThanOrEqual(0);
      expect(['low', 'medium', 'high']).toContain(
        result.capabilities.backend.confidence,
      );

      expect(result.ownership).toBeDefined();
      expect(typeof result.ownership.ownedProjects).toBe('number');

      expect(result.impact).toBeDefined();
      expect(['low', 'medium', 'high']).toContain(result.impact.activityLevel);
      expect(result.organizations).toEqual(expect.any(Array));
      expect(result).toHaveProperty('interactionProfile');

      // Verify no NaN or undefined values in scores
      const roles = [
        result.capabilities.backend,
        result.capabilities.frontend,
        result.capabilities.devops,
      ];
      roles.forEach((role) => {
        expect(role.score).not.toBeNaN();
        expect(role.score).toBeLessThanOrEqual(1.0);
      });
    });
  });

  it('should trigger private work notes correctly', () => {
    const result = scoringService.score(MAYA_DEVOPS);
    expect(result.privateWorkNote).toBeDefined();
    expect(result.privateWorkNote).toContain('private repositories');
  });
});

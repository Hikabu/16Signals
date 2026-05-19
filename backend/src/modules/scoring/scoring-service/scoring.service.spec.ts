import { Test, TestingModule } from '@nestjs/testing';
import { ScoringService } from './scoring.service';
import { SignalExtractorService } from '../signal-extractor/signal-extractor.service';
import { SummaryGeneratorService } from '../summary-generator/summary-generator.service';
import { EcosystemClassifierService } from '../signal-extractor/ecosystem-clarifier.service';
import { InteractionProfileService } from '../signal-extractor/interaction-profile.service';
import { StackFingerprintService } from '../signal-extractor/stack-fingerprint.service';
import { OrgAnalyserService } from '../signal-extractor/org-analyser.service';
import {
  ALEX_BACKEND,
  SARAH_FULLSTACK,
  MAYA_DEVOPS,
  NEW_DEV,
  GHOST_PROFILE,
} from '../signal-extractor/__fixtures__/seed-developers';

describe('ScoringService', () => {
  let service: ScoringService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        ScoringService,
        SignalExtractorService,
        SummaryGeneratorService,
        EcosystemClassifierService,
        InteractionProfileService,
        StackFingerprintService,
        OrgAnalyserService,
      ],
    }).compile();

    service = module.get<ScoringService>(ScoringService);
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('score()', () => {
    it('should calculate correct capabilities for ALEX_BACKEND (Go/Python)', () => {
      const result = service.score(ALEX_BACKEND);

      expect(result.capabilities.backend.score).toBeGreaterThan(0.7);
      expect(result.capabilities.frontend.score).toBeLessThan(0.3);
      expect(result.capabilities.backend.confidence).toBe('medium');
      expect(result.summary).toContain('Backend-focused developer');
    });

    it('should calculate correct capabilities for SARAH_FULLSTACK (TypeScript)', () => {
      const result = service.score(SARAH_FULLSTACK);

      expect(result.capabilities.frontend.score).toBeGreaterThan(0.6);
      expect(result.capabilities.backend.score).toBeGreaterThan(0.3);
      expect(result.capabilities.frontend.confidence).toBe('medium');
      expect(result.summary).toContain('Frontend-focused developer');
    });

    it('should calculate correct capabilities for MAYA_DEVOPS (Shell/HCL)', () => {
      const result = service.score(MAYA_DEVOPS);

      expect(result.capabilities.devops.score).toBeGreaterThan(0.8);
      expect(result.capabilities.devops.confidence).toBe('medium'); // S8 = 0.37 with new weights (medium: 0.3 < 0.37 <= 0.7)
      expect(result.privateWorkNote).toBeDefined();
    });

    it('should handle NEW_DEV (JavaScript, low activity)', () => {
      const result = service.score(NEW_DEV);

      expect(result.capabilities.frontend.score).toBeGreaterThan(0.5);
      expect(result.impact.activityLevel).toBe('low');
    });

    it('should handle GHOST_PROFILE (No owned repos)', () => {
      const result = service.score(GHOST_PROFILE);

      expect(result.capabilities.backend.score).toBeDefined();
      expect(result.ownership.ownedProjects).toBe(0);
    });
  });

  describe('Ownership Logic', () => {
    it('should correctly count maintained repos (within 180 days)', () => {
      // Alex has 5 non-fork repos, all pushed within few days of April 18
      const result = service.score(ALEX_BACKEND);
      expect(result.ownership.ownedProjects).toBe(5);
      expect(result.ownership.activelyMaintained).toBe(5);
    });

    it('upgrades ownership confidence when an org membership matches an external PR repo', () => {
      const result = service.score({
        ...NEW_DEV,
        repos: [],
        externalPRs: [
          { repo: 'vercel/next.js', mergedAt: '2025-01-01T00:00:00Z' },
        ],
        orgs: [
          { login: 'vercel', description: 'Frontend cloud', publicRepos: 100 },
        ],
        orgRepos: {
          vercel: [
            {
              name: 'old',
              pushedAt: '2024-01-01T00:00:00Z',
              language: 'TypeScript',
            },
            {
              name: 'next.js',
              pushedAt: '2026-01-01T00:00:00Z',
              language: 'JavaScript',
            },
          ],
        },
      } as any);

      expect(result.organizations).toEqual([
        {
          login: 'vercel',
          description: 'Frontend cloud',
          publicRepos: 100,
          confirmedContributor: true,
          notableRepos: ['next.js', 'old'],
        },
      ]);
      expect(result.ownership.confidence).toBe('medium');
    });

    it('keeps confirmedContributor false and adds org private-work note without matching external PRs', () => {
      const result = service.score({
        ...NEW_DEV,
        repos: [],
        externalPRs: [],
        orgs: [{ login: 'vercel', description: '', publicRepos: 100 }],
        orgRepos: {},
      } as any);

      expect(result.organizations[0].confirmedContributor).toBe(false);
      expect(result.privateWorkNote).toBe(
        'Appears to work primarily in private/org repositories',
      );
      expect(result.ownership.confidence).toBe('low');
    });

    it('returns an empty organizations array when there are no public memberships', () => {
      const result = service.score({
        ...NEW_DEV,
        orgs: [],
        orgRepos: {},
      } as any);

      expect(result.organizations).toEqual([]);
    });
  });

  describe('Interaction Profile', () => {
    it('promotes S9 to solana from starred repo affinity when owned repos are not solana', () => {
      const result = service.score({
        ...NEW_DEV,
        repos: [],
        starredRepos: Array.from({ length: 5 }, () => ({
          language: 'TypeScript',
          topics: ['solana'],
        })),
      } as any);

      expect(result.interactionProfile?.ecosystemAffinity).toBe('solana');
      expect(result.web3?.ecosystem).toBe('solana');
      expect(result.web3?.ecosystemSource).toBe('interaction_affinity');
      expect(result.summary).toContain('Active in the Solana ecosystem.');
    });

    it('keeps interactionProfile null when there are no starred repos', () => {
      const result = service.score({
        ...NEW_DEV,
        starredRepos: [],
      } as any);

      expect(result.interactionProfile).toBeNull();
    });
  });

  describe('Impact Logic', () => {
    it('should detect trends correctly', () => {
      const result = service.score(ALEX_BACKEND);
      expect(result.impact.consistency).toBe('strong'); // Ascending trend (first 7 weeks=0, then 45 weeks=10)
    });
  });
});

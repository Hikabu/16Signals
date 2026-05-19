import { Test, TestingModule } from '@nestjs/testing';
import { EcosystemClassifierService } from '../ecosystem-clarifier.service';

describe('EcosystemClassifierService', () => {
  let service: EcosystemClassifierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EcosystemClassifierService],
    }).compile();

    service = module.get<EcosystemClassifierService>(
      EcosystemClassifierService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectEcosystemIdentity', () => {
    it("1. repo with topics: ['anchor'] -> ecosystemIdentity: 'solana'", () => {
      const repos = [{ name: 'my-project', topics: ['anchor'] }];
      expect(service.detectEcosystemIdentity(repos)).toBe('solana');
    });

    it("2. repo with topics: ['react','typescript'] -> ecosystemIdentity: null", () => {
      const repos = [{ name: 'frontend', topics: ['react', 'typescript'] }];
      expect(service.detectEcosystemIdentity(repos)).toBeNull();
    });

    it("7. multiple repos, only one has solana topic -> ecosystemIdentity: 'solana'", () => {
      const repos = [
        { name: 'frontend', topics: ['react'] },
        { name: 'backend', topics: ['node'] },
        { name: 'smart-contract', topics: ['solana-program', 'rust'] },
      ];
      expect(service.detectEcosystemIdentity(repos)).toBe('solana');
    });

    it('6. empty repos -> ecosystemIdentity: null', () => {
      expect(service.detectEcosystemIdentity([])).toBeNull();
      // Also test with completely absent or invalid input
      expect(service.detectEcosystemIdentity(undefined as any)).toBeNull();
    });

    it('uses interaction affinity when owned repos have no ecosystem identity', () => {
      const repos = [{ name: 'frontend', topics: ['react'] }];

      expect(
        service.detectEcosystemIdentity(repos, {
          topicAffinity: ['solana'],
          languageAffinity: ['Rust'],
          ecosystemAffinity: 'solana',
        }),
      ).toBe('solana');
    });
  });

  describe('countEcosystemPRs', () => {
    it("3. externalPR { repo: 'coral-xyz/anchor' } -> ecosystemPRs: 1", () => {
      const prs = [{ repo: 'coral-xyz/anchor' }];
      expect(service.countEcosystemPRs(prs)).toBe(1);
    });

    it("4. externalPR { repo: 'facebook/react' } -> ecosystemPRs: 0", () => {
      const prs = [{ repo: 'facebook/react' }];
      expect(service.countEcosystemPRs(prs)).toBe(0);
    });

    it('5. mixed PRs: coral-xyz/anchor + facebook/react -> ecosystemPRs: 1', () => {
      const prs = [{ repo: 'coral-xyz/anchor' }, { repo: 'facebook/react' }];
      expect(service.countEcosystemPRs(prs)).toBe(1);
    });

    it('6. empty PRs -> ecosystemPRs: 0', () => {
      expect(service.countEcosystemPRs([])).toBe(0);
      // Also test with completely absent or invalid input
      expect(service.countEcosystemPRs(undefined as any)).toBe(0);
    });
  });
});

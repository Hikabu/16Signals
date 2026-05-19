import { Test, TestingModule } from '@nestjs/testing';
import { StackFingerprintService } from '../stack-fingerprint.service';

describe('StackFingerprintService', () => {
  let service: StackFingerprintService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StackFingerprintService],
    }).compile();

    service = module.get<StackFingerprintService>(StackFingerprintService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectTools', () => {
    it('detects bullmq and pg as BullMQ and PostgreSQL', () => {
      const result = service.detectTools([
        { repo: 'repo1', deps: ['bullmq', 'pg'], type: 'npm' },
      ]);
      expect(result).toEqual(['BullMQ', 'PostgreSQL']);
    });

    it('detects anchor-lang and forge-std as Anchor and Foundry', () => {
      const result = service.detectTools([
        { repo: 'repo1', deps: ['anchor-lang', 'forge-std'], type: 'cargo' },
      ]);
      expect(result).toEqual(['Anchor', 'Foundry']);
    });

    it('deduplicated AWS SDK clients to a single AWS entry', () => {
      const result = service.detectTools([
        {
          repo: 'repo1',
          deps: ['@aws-sdk/client-s3', '@aws-sdk/client-ec2'],
          type: 'npm',
        },
      ]);
      expect(result).toEqual(['AWS']);
    });

    it('returns empty array for random libraries', () => {
      const result = service.detectTools([
        { repo: 'repo1', deps: ['some-random-lib'], type: 'npm' },
      ]);
      expect(result).toEqual([]);
    });

    it('deduplicates the same tool across multiple repos', () => {
      const result = service.detectTools([
        { repo: 'repo1', deps: ['prisma', 'bullmq'], type: 'npm' },
        { repo: 'repo2', deps: ['prisma', 'pg'], type: 'npm' },
      ]);
      expect(result).toEqual(['BullMQ', 'PostgreSQL', 'Prisma']);
    });

    it('handles empty input', () => {
      expect(service.detectTools([])).toEqual([]);
    });
  });

  describe('extract', () => {
    it('passes through languages unchanged while detecting tools', () => {
      const manifests = [
        { repo: 'repo1', deps: ['prisma'], type: 'npm' as const },
      ];
      const languages = ['Rust', 'TypeScript'];
      const result = service.extract(manifests, languages);
      expect(result).toEqual({
        languages: ['Rust', 'TypeScript'],
        tools: ['Prisma'],
      });
    });
  });
});

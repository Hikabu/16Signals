import { InteractionProfileService } from './interaction-profile.service';

describe('InteractionProfileService', () => {
  let service: InteractionProfileService;

  beforeEach(() => {
    service = new InteractionProfileService();
  });

  it('sets solana ecosystem affinity when starred repo topics are solana-heavy', () => {
    const result = service.compute(
      Array.from({ length: 5 }, () => ({
        language: 'TypeScript',
        topics: ['solana', 'web3'],
      })),
    );

    expect(result?.ecosystemAffinity).toBe('solana');
    expect(result?.topicAffinity).toContain('solana');
  });

  it('keeps ecosystem affinity null for random starred topics', () => {
    const result = service.compute([
      { language: 'TypeScript', topics: ['react', 'frontend'] },
      { language: 'Go', topics: ['grpc', 'backend'] },
    ]);

    expect(result?.ecosystemAffinity).toBeNull();
  });

  it('returns null when there are no starred repos', () => {
    expect(service.compute([])).toBeNull();
  });

  it('sets solana ecosystem affinity for Rust starred repos with anchor topics', () => {
    const result = service.compute([
      { language: 'Rust', topics: ['anchor', 'programs'] },
    ]);

    expect(result?.ecosystemAffinity).toBe('solana');
  });
});

import { OrgAnalyserService } from './org-analyser.service';

describe('OrgAnalyserService', () => {
  let service: OrgAnalyserService;

  beforeEach(() => {
    service = new OrgAnalyserService();
  });

  it('confirms org contributors using case-insensitive external PR repo prefixes', () => {
    const result = service.analyse(
      [{ login: 'Vercel', description: 'Frontend cloud', publicRepos: 100 }],
      new Map([
        [
          'vercel',
          [
            {
              name: 'next.js',
              pushedAt: '2026-01-01T00:00:00Z',
              language: 'JavaScript',
            },
          ],
        ],
      ]),
      [{ repo: 'vercel/next.js', mergedAt: '2025-01-01T00:00:00Z' }],
    );

    expect(result[0].confirmedContributor).toBe(true);
    expect(result[0].notableRepos).toEqual(['next.js']);
  });

  it('does not confirm membership without a matching external PR', () => {
    const result = service.analyse(
      [{ login: 'vercel', description: '', publicRepos: 100 }],
      new Map(),
      [{ repo: 'facebook/react', mergedAt: '2025-01-01T00:00:00Z' }],
    );

    expect(result[0].confirmedContributor).toBe(false);
  });

  it('returns [] when there are no public org memberships', () => {
    expect(service.analyse([], new Map(), [])).toEqual([]);
  });
});

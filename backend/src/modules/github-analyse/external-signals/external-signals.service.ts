import { Injectable, Logger } from '@nestjs/common';
import { RawGroupB, RawGroupF } from '../../../types/primitives.types';

@Injectable()
export class ExternalSignalService {
  private readonly logger = new Logger(ExternalSignalService.name);

  /**
   * Fetches supplementary signals from package registries and Stack Overflow.
   * BEST-EFFORT: API failures are caught, logged, and return null/empty.
   */
  async fetch(githubUsername: string, repos: RawGroupB['repos']): Promise<RawGroupF> {
    const [npmResult, pypiResult, cratesResult, soResult] = await Promise.allSettled([
      this.fetchNpm(githubUsername),
      this.fetchPyPI(repos),
      this.fetchCratesIo(githubUsername, repos),
      this.fetchStackOverflow(githubUsername),
    ]);

    const packageRegistryPresence: RawGroupF['packageRegistryPresence'] = [];
    
    if (npmResult.status === 'fulfilled' && npmResult.value) {
      packageRegistryPresence.push(...npmResult.value);
    }
    if (pypiResult.status === 'fulfilled' && pypiResult.value) {
      packageRegistryPresence.push(...pypiResult.value);
    }
    if (cratesResult.status === 'fulfilled' && cratesResult.value) {
      packageRegistryPresence.push(...cratesResult.value);
    }

    let stackOverflowReputation: number | undefined;
    let stackOverflowTopTags: string[] | undefined;

    if (soResult.status === 'fulfilled' && soResult.value) {
      stackOverflowReputation = soResult.value.reputation;
      stackOverflowTopTags = soResult.value.tags;
    }

    return {
      contributionCalendarWeeks: 0, // Populated by LightFetcherService
      totalStarsOwned: 0, // Populated by LightFetcherService
      totalForksOwned: 0, // Populated by LightFetcherService
      packageRegistryPresence,
      ...(stackOverflowReputation !== undefined && { stackOverflowReputation }),
      ...(stackOverflowTopTags !== undefined && { stackOverflowTopTags }),
    };
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal as any });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return response;
    } finally {
      clearTimeout(id);
    }
  }

  /**
   * 1. npm Registry
   */
  private async fetchNpm(username: string): Promise<RawGroupF['packageRegistryPresence']> {
    try {
      const searchRes = await this.fetchWithTimeout(`https://registry.npmjs.org/-/v1/search?text=maintainer:${username}&size=10`);
      const searchData = await searchRes.json() as any;
      const packages = searchData.objects || [];
      
      const results = await Promise.allSettled(
        packages.map(async (p: any) => {
          const packageName = p.package.name;
          const dlRes = await this.fetchWithTimeout(`https://api.npmjs.org/downloads/point/last-week/${packageName}`);
          const dlData = await dlRes.json() as any;
          return {
            registry: 'npm' as const,
            packageName,
            weeklyDownloads: dlData.downloads || 0,
          };
        })
      );

      return results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (e) {
      this.logger.warn(`Failed to fetch npm data for ${username}: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  /**
   * 2. PyPI JSON API
   */
  private async fetchPyPI(repos: RawGroupB['repos']): Promise<RawGroupF['packageRegistryPresence']> {
    try {
      const pypiRepos = repos.filter(repo => 
        repo.fileTreeSample?.includes('setup.py') || repo.fileTreeSample?.includes('pyproject.toml')
      );

      const results = await Promise.allSettled(
        pypiRepos.map(async (repo) => {
          const packageName = repo.name; // Heuristic: repo name = package name
          
          // Verify it exists on PyPI
          await this.fetchWithTimeout(`https://pypi.org/pypi/${packageName}/json`);
          
          let downloadsLastMonth = 0;
          try {
            const statsRes = await this.fetchWithTimeout(`https://pypistats.org/api/packages/${packageName}/recent`);
            const statsData = await statsRes.json() as any;
            downloadsLastMonth = statsData.data?.last_month || 0;
          } catch {
            // Ignore stats failure if the package exists
          }

          return {
            registry: 'pypi' as const,
            packageName,
            // Convert monthly to approx weekly to match primitive spec
            weeklyDownloads: Math.floor(downloadsLastMonth / 4),
          };
        })
      );

      return results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (e) {
      this.logger.warn(`Failed to fetch PyPI data: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  /**
   * 3. Crates.io API
   */
  private async fetchCratesIo(username: string, repos: RawGroupB['repos']): Promise<RawGroupF['packageRegistryPresence']> {
    try {
      const cargoRepos = repos.filter(repo => repo.fileTreeSample?.includes('Cargo.toml'));
      if (cargoRepos.length === 0) return [];

      const headers = { 'User-Agent': 'colosseum-analysis/1.0 (contact@colosseum.dev)' };
      
      const searchRes = await this.fetchWithTimeout(`https://crates.io/api/v1/crates?q=${username}&page=1`, { headers });
      const searchData = await searchRes.json() as any;
      const crates = searchData.crates || [];

      const repoNames = new Set(cargoRepos.map(r => r.name.toLowerCase()));
      const matchedCrates = crates.filter((c: any) => repoNames.has(c.name.toLowerCase()));

      const results = await Promise.allSettled(
        matchedCrates.map(async (crate: any) => {
          const crateName = crate.name;
          
          const detailRes = await this.fetchWithTimeout(`https://crates.io/api/v1/crates/${crateName}`, { headers });
          const detailData = await detailRes.json() as any;
          
          let dependentCount = 0;
          try {
            const revDepsRes = await this.fetchWithTimeout(`https://crates.io/api/v1/crates/${crateName}/reverse_dependencies`, { headers });
            const revDepsData = await revDepsRes.json() as any;
            dependentCount = revDepsData.meta?.total || 0;
          } catch {
            // Ignore failure to get dependents
          }
          
          return {
            registry: 'crates' as const,
            packageName: crateName,
            weeklyDownloads: detailData.crate?.recent_downloads || 0,
            dependentCount,
          };
        })
      );

      return results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (e) {
      this.logger.warn(`Failed to fetch Crates.io data for ${username}: ${e instanceof Error ? e.message : e}`);
      return [];
    }
  }

  /**
   * 4. Stack Exchange API
   */
  private async fetchStackOverflow(username: string): Promise<{ reputation: number; tags: string[] } | null> {
    try {
      const userRes = await this.fetchWithTimeout(
        `https://api.stackexchange.com/2.3/users?inname=${username}&site=stackoverflow&filter=default`, 
        {}, 
        3000
      );
      const userData = await userRes.json() as any;
      const users = userData.items || [];
      
      if (users.length === 0) return null;
      
      const user = users.find((u: any) => u.display_name.toLowerCase() === username.toLowerCase()) || users[0];
      
      const tagsRes = await this.fetchWithTimeout(
        `https://api.stackexchange.com/2.3/users/${user.user_id}/tags?order=desc&sort=popular&site=stackoverflow`, 
        {}, 
        3000
      );
      const tagsData = await tagsRes.json() as any;
      const topTags = (tagsData.items || []).slice(0, 3).map((t: any) => t.name);

      return {
        reputation: user.reputation,
        tags: topTags,
      };
    } catch (e) {
      this.logger.warn(`Failed to fetch StackOverflow data for ${username}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }
}

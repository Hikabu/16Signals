/**
 * DeepCollectorService — Deep Mode collection: private repos, clone workers, tool runners.
 *
 * Architecture:
 *   1. Ensure Light corpus exists (cache hit or inline Light collection)
 *   2. Enrich Group A identity signals (private orgs via installation token,
 *      exhaustive commit emails via git log on cloned repos)
 *   3. Fetch private repos via GitHub App installation token
 *   4. Clone each private repo to tmpfs using CloneWorkerManager
 *   5. Run analysis tools: scc (complexity), tokei (test/code ratio),
 *      gitinspector (per-author stats), gitleaks (secrets), semgrep (SAST)
 *   6. Merge Deep-only fields into the corpus (groups A, C, E, G enriched)
 *   7. Cleanup: remove cloned repos (try/finally guarantee)
 *
 * Completion SLA: 15 minutes for full Deep Mode.
 * Token refresh: Installation tokens refreshed at 50-minute mark (for large repos).
 *
 * Note: During Group A isolation testing, steps 3–5 (private repo clone/analyze)
 * are commented out. Only Group A identity enrichment runs.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 8
 * Aligned with: USER_FLOWS_AND_GOALS_VERIFICATION.md Section 1 Flow 3
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { CorpusCacheService } from '../../corpus/corpus-cache.service';
import { CorpusBuilderService, GroupCollectionResult } from '../corpus-builder.service';
import { SignalCorpus, CorpusGroup, CommitSignals, EngineeringPracticeSignals } from '../../corpus/corpus.types';
import { CloneWorkerManager, CloneWorkerResult } from './clone-worker-manager';
import { CircuitBreakerService } from '../circuit-breaker.service';
import { DataCollectorService } from '../data-collector.service';

export interface DeepCollectorOutput {
  corpus: SignalCorpus;
  groupsEnriched: CorpusGroup[];
  reposCloned: number;
  reposSucceeded: number;
  reposFailed: number;
  totalDurationMs: number;
  secretLeaksFound: number;
}

@Injectable()
export class DeepCollectorService {
  constructor(
    private readonly corpusCache: CorpusCacheService,
    private readonly corpusBuilder: CorpusBuilderService,
    private readonly cloneWorker: CloneWorkerManager,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly dataCollector: DataCollectorService,
  ) {}

  /**
   * Perform Deep Mode collection.
   * 1. Ensure Light corpus exists (cache hit or inline collection)
   * 2. Enrich Group A identity signals via installation token
   * 3. [FUTURE] Fetch private repos, clone, analyze, merge C/E/G delta
   */
  async collectDeepMode(
    octokit: Octokit,
    appOctokit: Octokit,
    username: string,
    installationId: number,
    jobId: string,
  ): Promise<DeepCollectorOutput> {
    const startTime = Date.now();
    console.log(
      `[DeepCollector] phase=collect_start jobId=${jobId} username=${username} ` +
      `mode=deep installationId=${installationId}`,
    );

    this.circuitBreaker.reset();

    // ── 1. Ensure Light corpus exists (cache hit or inline collection) ──
    const { lightCorpus, groupsCollected } = await this.acquireLightCorpus(
      octokit,
      username,
      jobId,
    );
    console.log(
      `[DeepCollector] phase=light_corpus_ready jobId=${jobId} ` +
      `corpusId=${lightCorpus.corpus_id} groups=${lightCorpus.groups_present.join(',')}`,
    );

    // ── 2. Enrich Group A identity signals ──
    const enrichedIdentity = await this.enrichIdentityDeep(
      appOctokit,
      username,
      lightCorpus,
      jobId,
    );

    const deepIdentityDelta: Partial<SignalCorpus> = {
      identity: enrichedIdentity,
    };

    // Merge the Group A identity delta into the corpus
    const mergedCorpus = await this.corpusCache.mergeDelta(lightCorpus, deepIdentityDelta);

    // ── 3. [COMMENTED OUT — Group A isolation testing] Fetch private repos ──
    // const privateRepos = await this.fetchPrivateRepos(octokit, appOctokit, username, jobId);
    //
    // if (privateRepos.length === 0) {
    //   // No private repos — return with Group A enrichment only
    //   ...
    // }
    //
    // // ── 4. Clone and analyze each private repo ──
    // const cloneResults = await this.cloneAllRepos(privateRepos, jobId, installToken);
    // const succeeded = cloneResults.filter((r) => r.success);
    //
    // // ── 5. Extract Deep-only signals from tool outputs (groups C, E, G) ──
    // const { delta: toolDelta, totalSecretLeaks } = this.extractDeepDelta(succeeded, mergedCorpus);
    // const finalCorpus = await this.corpusCache.mergeDelta(mergedCorpus, toolDelta);

    const totalDurationMs = Date.now() - startTime;
    const groupsEnriched: CorpusGroup[] = ['A']; // Group A is always enriched in Deep mode

    console.log(
      `[DeepCollector] phase=collect_complete jobId=${jobId} ` +
      `totalDurationMs=${totalDurationMs} ` +
      `groupsPresent=${mergedCorpus.groups_present.join(',')} ` +
      `groupsEnriched=${groupsEnriched.join(',')} ` +
      `identity={orgs=${mergedCorpus.identity.github_org_memberships.length} ` +
      `emailDomains=${mergedCorpus.identity.commit_email_domains.length}}`,
    );

    return {
      corpus: mergedCorpus,
      groupsEnriched,
      reposCloned: 0,
      reposSucceeded: 0,
      reposFailed: 0,
      totalDurationMs,
      secretLeaksFound: 0,
    };
  }

  /**
   * Acquire Light corpus: check cache, collect inline if missing.
   *
   * Previously threw an error when no cache existed, making Deep mode
   * dependent on a prior Light mode run. Now performs inline Light
   * collection using the provided Octokit (which in Deep mode is the
   * installation token, providing higher rate limits and access).
   */
  private async acquireLightCorpus(
    octokit: Octokit,
    username: string,
    jobId: string,
  ): Promise<{ lightCorpus: SignalCorpus; groupsCollected: CorpusGroup[] }> {
    const cached = await this.corpusCache.get(username, 'light');

    if (cached) {
      console.log(
        `[DeepCollector] phase=cache_hit jobId=${jobId} username=${username} ` +
        `corpusId=${cached.corpus_id}`,
      );
      return { lightCorpus: cached, groupsCollected: cached.groups_present };
    }

    // Cache miss — run Light collection inline.
    // Uses the provided Octokit (installation token in Deep mode) so the
    // collection benefits from the installation's rate limit and scope.
    console.log(
      `[DeepCollector] phase=cache_miss_collecting jobId=${jobId} username=${username} ` +
      `running inline Light collection`,
    );

    const { corpus } = await this.dataCollector.collectLightMode(
      octokit,
      username,
      jobId,
    );

    // Cache the fresh corpus for future use
    await this.corpusCache.set(corpus);

    console.log(
      `[DeepCollector] phase=light_collected jobId=${jobId} ` +
      `corpusId=${corpus.corpus_id} groups=${corpus.groups_present.join(',')}`,
    );

    return { lightCorpus: corpus, groupsCollected: corpus.groups_present };
  }

  /**
   * Enrich Group A identity signals using the installation token.
   *
   * Light mode collects public orgs via GET /users/{username}/orgs (no auth).
   * Deep mode additionally collects:
   *   1. Private org memberships via GET /user/orgs (installation-scoped)
   *   2. [FUTURE] Exhaustive commit emails via git log on cloned repos
   *
   * The installation token has read:org equivalent scope for the user's
   * organizations within the App installation.
   */
  private async enrichIdentityDeep(
    appOctokit: Octokit,
    username: string,
    lightCorpus: SignalCorpus,
    jobId: string,
  ): Promise<any> {
    const identity = { ...lightCorpus.identity };
    const enriched: string[] = [];

    // ── Private org memberships ─────────────────────────────────────
    // Light mode already collected public orgs. Deep mode adds private
    // orgs that are only visible to the installation token.
    try {
      const privateOrgsResponse =
        await appOctokit.rest.orgs.listForAuthenticatedUser({
          per_page: 100,
        });

      const privateOrgNames = privateOrgsResponse.data.map(
        (org: any) => org.login,
      );

      // Merge with existing public orgs, deduplicating
      const existingOrgs = new Set(identity.github_org_memberships);
      let privateOrgsAdded = 0;
      for (const orgName of privateOrgNames) {
        if (!existingOrgs.has(orgName)) {
          existingOrgs.add(orgName);
          privateOrgsAdded++;
        }
      }

      identity.github_org_memberships = [...existingOrgs];

      if (privateOrgsAdded > 0) {
        enriched.push(`privateOrgs(+${privateOrgsAdded})`);
      }
    } catch (error) {
      console.log(
        `  [DeepCollector] phase=private_orgs_error jobId=${jobId} ` +
        `error=${(error as Error).message}`,
      );
      // Keep public orgs only — private org enrichment is best-effort
    }

    // ── [FUTURE] Exhaustive commit emails via git log ───────────────
    // When private repo cloning is re-enabled, extract all author.email
    // values from git log --format='%ae' across cloned repos and merge
    // into identity.commit_email_domains with deduplication.

    if (enriched.length > 0) {
      console.log(
        `  [DeepCollector] phase=identity_enriched jobId=${jobId} ` +
        `fields=${enriched.join(',')}`,
      );
    }

    return identity;
  }

  // ══════════════════════════════════════════════════════════════════
  // Private repo methods — COMMENTED OUT for Group A isolation testing
  // These will be re-enabled when the full Deep mode pipeline is tested.
  // ══════════════════════════════════════════════════════════════════

  // /**
  //  * Fetch private repos accessible via the GitHub App installation.
  //  */
  // private async fetchPrivateRepos(
  //   octokit: Octokit,
  //   appOctokit: Octokit,
  //   username: string,
  //   jobId: string,
  // ): Promise<Array<{ name: string; full_name: string; clone_url: string }>> { ... }
  //
  // /**
  //  * Clone all private repos in parallel batches.
  //  */
  // private async cloneAllRepos(
  //   repos: Array<{ name: string; full_name: string; clone_url: string }>,
  //   jobId: string,
  //   installToken?: string,
  // ): Promise<CloneWorkerResult[]> { ... }
  //
  // /**
  //  * Extract Deep-only signals from clone worker results (groups C, E, G).
  //  */
  // private extractDeepDelta(
  //   results: CloneWorkerResult[],
  //   existingCorpus: SignalCorpus,
  // ): { delta: Partial<SignalCorpus>; totalSecretLeaks: number } { ... }
}
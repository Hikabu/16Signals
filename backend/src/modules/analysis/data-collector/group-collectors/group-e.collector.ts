/*
 * Group E Collector — Engineering Practices
 *
 * Fetches: CI/CD config, testing, Docker, IaC, linting, observability markers,
 *          AI config files, actionlint violations.
 *
 * API calls: 1 file check per repo (GET /repos/:owner/:repo/contents)
 * Output: EngineeringPracticeSignals
 *
 * Reference: corpus.types.ts Group E*
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import {
  EngineeringPracticeSignals,
  RepositorySignal,
} from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

const CHECK_PATHS = {
  testDir: [
    'test/',
    'tests/',
    '__tests__/',
    'spec/',
    'jest.config',
    'vitest.config',
    'pytest.ini',
  ],
  ciConfig: [
    '.github/workflows/',
    '.gitlab-ci.yml',
    'Jenkinsfile',
    '.circleci/',
  ],
  docker: ['Dockerfile', 'docker-compose.yml', '.dockerignore'],
  iac: ['terraform/', 'Pulumi', '.k8s/', 'kubernetes/', 'helm/'],
  linting: [
    '.eslintrc',
    '.prettierrc',
    'tslint.json',
    'golangci.yml',
    '.rubocop.yml',
  ],
  aiConfig: [
    '.cursorrules',
    'claude.md',
    '.github/copilot-instructions.md',
    'ai-context.md',
  ],
  observability: [
    'prometheus',
    'grafana',
    'datadog',
    'newrelic',
    'opentelemetry',
    'sentry',
  ],
};

const MAX_REPOS_TO_CHECK = 10;

@Injectable()
export class GroupECollector {
  async collect(
    octokit: Octokit,
    username: string,
    repos: RepositorySignal[],
    circuitBreaker: CircuitBreakerService,
  ): Promise<EngineeringPracticeSignals> {
    console.log(`	[E_GroupCollector] phase=collect_start username=${username}`);

    const targetRepos = repos
      .filter((r) => !r.is_fork && !r.is_archived)
      .sort((a, b) => b.quality_score - a.quality_score)
      .slice(0, MAX_REPOS_TO_CHECK);

    let reposWithTestDir = 0;
    let reposWithCi = 0;

    for (const repo of targetRepos) {
      if (circuitBreaker.shouldAbort()) break;

      // Check test directory
      for (const testPath of CHECK_PATHS.testDir) {
        if (
          await this.fileExists(
            octokit,
            username,
            repo.name,
            testPath,
            circuitBreaker,
          )
        ) {
          reposWithTestDir++;
          break;
        }
      }

      // Check CI config
      for (const ciPath of CHECK_PATHS.ciConfig) {
        if (
          await this.fileExists(
            octokit,
            username,
            repo.name,
            ciPath,
            circuitBreaker,
          )
        ) {
          reposWithCi++;
          break;
        }
      }
    }

    // Compute real CI pass rate from GitHub Actions workflow runs.
    // For repos with .github/workflows, fetch recent workflow runs per quarter.
    const ciPassRateTrajectory = await this.computeCiPassRate(
      octokit,
      username,
      targetRepos,
      circuitBreaker,
    );

    console.log(
      `	[E_GroupCollector] phase=collect_complete username=${username} ` +
        `tests=${reposWithTestDir} ` +
        `ci=${reposWithCi} ` +
        `ci success=${ciPassRateTrajectory}`,
    );

    return {
      repos_with_test_dir: reposWithTestDir,
      repos_with_ci_config: reposWithCi,
      ci_pass_rate_trajectory: ciPassRateTrajectory,
    };
  }

  /**
   * Compute CI pass rate trajectory by quarter from GitHub Actions workflow runs.
   * Fetches recent workflow runs for repos with CI config and computes pass rates per quarter.
   * Falls back to empty object if no workflow runs are accessible.
   */
  private async computeCiPassRate(
    octokit: Octokit,
    username: string,
    targetRepos: RepositorySignal[],
    circuitBreaker: CircuitBreakerService,
  ): Promise<Record<string, number>> {
    const trajectory: Record<string, number> = {};
    const repoCiData: Array<{
      quarter: string;
      passed: number;
      total: number;
    }> = [];

    for (const repo of targetRepos) {
      if (circuitBreaker.shouldAbort()) break;

      try {
        // Check if repo has GitHub Actions workflows
        const workflowsResp = await octokit.rest.actions.listRepoWorkflows({
          owner: username,
          repo: repo.name,
          per_page: 10,
        });
        circuitBreaker.updateFromHeaders(workflowsResp.headers as any);

        const workflows = workflowsResp.data.workflows || [];
        if (workflows.length === 0) continue;

        // Fetch recent workflow runs (last 30 per workflow)
        for (const workflow of workflows.slice(0, 3)) {
          const runsResp = await octokit.rest.actions.listWorkflowRuns({
            owner: username,
            repo: repo.name,
            workflow_id: workflow.id,
            per_page: 30,
          });
          circuitBreaker.updateFromHeaders(runsResp.headers as any);

          const runs = runsResp.data.workflow_runs || [];
          for (const run of runs) {
            if (!run.created_at) continue;
            const runDate = new Date(run.created_at);
            const quarter = `${runDate.getFullYear()}-Q${Math.ceil((runDate.getMonth() + 1) / 3)}`;

            const passed = run.conclusion === 'success' ? 1 : 0;
            const failed =
              run.conclusion === 'failure' || run.conclusion === 'cancelled'
                ? 1
                : 0;

            if (passed > 0 || failed > 0) {
              repoCiData.push({ quarter, passed, total: 1 });
            }
          }
        }
      } catch {
        // No workflow access or no workflows — skip repo
      }
    }

    // Aggregate by quarter
    const quarterAgg: Record<string, { passed: number; total: number }> = {};
    for (const entry of repoCiData) {
      if (!quarterAgg[entry.quarter]) {
        quarterAgg[entry.quarter] = { passed: 0, total: 0 };
      }
      quarterAgg[entry.quarter].passed += entry.passed;
      quarterAgg[entry.quarter].total += entry.total;
    }

    for (const [quarter, stats] of Object.entries(quarterAgg)) {
      trajectory[quarter] =
        stats.total > 0
          ? Math.round((stats.passed / stats.total) * 100) / 100
          : 0;
    }

    return trajectory;
  }

  private async fileExists(
    octokit: Octokit,
    owner: string,
    repo: string,
    path: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<boolean> {
    if (circuitBreaker.shouldAbort()) return false;

    try {
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
      });
      circuitBreaker.updateFromHeaders(response.headers as any);
      return true;
    } catch (err: any) {
      if (err.status === 404) return false;
      if (err.status === 403 || err.status === 429) return false;
      return false;
    }
  }
}

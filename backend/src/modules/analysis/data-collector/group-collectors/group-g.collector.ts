/**
 * Group G Collector — Anti-Gaming Raw Inputs
 *
 * Computes: Burst/dormancy ratio, fork dump ratio, commit inflation ratio,
 *           code search similarity, style discontinuity events.
 *
 * This collector is purely computational — it derives anti-gaming signals
 * from the data already collected in Groups B and C.
 *
 * Reference: corpus.types.ts Group G
 */

import { Injectable } from '@nestjs/common';
import {
  AntiGamingInputs,
  CommitSignals,
  RepositorySignal,
  CodeSearchFlag,
  StyleDiscontinuityEvent,
} from '../../corpus/corpus.types';

@Injectable()
export class GroupGCollector {
  collectLight(
    commitSignals: CommitSignals,
    repos: RepositorySignal[],
  ): AntiGamingInputs {
    console.log(`	[$1_GroupCollector] phase=build_start mode=light`);

    // ── Burst/dormancy ratio ──
    const burstDormancyRatio = this.computeBurstDormancyRatio(
      commitSignals.commit_frequency_by_month,
    );

    // ── Fork dump ratio ──
    const totalRepos = repos.length;
    const forkCount = repos.filter((r) => r.is_fork).length;
    const forkDumpRatio = totalRepos > 0 ? forkCount / totalRepos : 0;

    // ── Commit inflation ratio (proxy from sub-5-line ratio) ──
    const commitInflationRatio = commitSignals.sub_5_line_commit_ratio;

    // ── Code search flags (requires separate API call; computed here as empty) ──
    const codeSearchFlags: CodeSearchFlag[] = [];

    // ── Style discontinuity (requires deep analysis; empty in Light) ──
    const styleEvents: StyleDiscontinuityEvent[] = [];

    console.log(
      `	[$1_GroupCollector] phase=build_complete ` +
      `burstRatio=${burstDormancyRatio.toFixed(2)} forkRatio=${forkDumpRatio.toFixed(2)} ` +
      `inflationRatio=${commitInflationRatio.toFixed(2)}`,
    );

    return {
      burst_dormancy_ratio: burstDormancyRatio,
      burst_triggered_at_evaluation: false, // Requires job creation timestamp comparison
      fork_dump_ratio: forkDumpRatio,
      code_search_flags: codeSearchFlags,
      copyleaks_results: [], // Copyleaks integration in Stage 8
      commit_inflation_ratio: commitInflationRatio,
      ai_pattern_confidence: 0, // Populated after LLM Wave 3
      style_discontinuity_events: styleEvents,
    };
  }

  /**
   * Compute burst/dormancy ratio:
   * Last 30 days weekly average / trailing 12 months weekly average.
   */
  private computeBurstDormancyRatio(
    freqByMonth: Record<string, number>,
  ): number {
    const months = Object.entries(freqByMonth)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));

    if (months.length < 2) return 1.0;

    const totalWeeklyAvg =
      months.reduce((sum, m) => sum + m.count, 0) / (months.length * 4.33);

    // Take the most recent month's weekly average
    const lastMonth = months[months.length - 1];
    const recentWeeklyAvg = lastMonth.count / 4.33;

    if (totalWeeklyAvg === 0) return 1.0;

    return recentWeeklyAvg / totalWeeklyAvg;
  }
}
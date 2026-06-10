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
    evaluationTimestampMs?: number,
  ): AntiGamingInputs {
    console.log(`	[$1_GroupCollector] phase=build_start mode=light`);

    // ── Burst/dormancy ratio ──
    const burstDormancyRatio = this.computeBurstDormancyRatio(
      commitSignals.commit_frequency_by_month,
    );

    // ── Burst triggered at evaluation ──
    // A burst is detected if the recent month's weekly average is
    // more than 3× the trailing 12-month weekly average.
    // Plus, if evaluation timestamp is provided, check if the burst
    // aligns with a job application date (indicating gaming).
    const months = Object.entries(commitSignals.commit_frequency_by_month)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => a.key.localeCompare(b.key));

    let burstTriggeredAtEval = false;
    if (burstDormancyRatio > 3.0) {
      burstTriggeredAtEval = true;
    }

    // Cross-reference with evaluation timestamp: if provided, check if the
    // most active month was within 30 days before the evaluation.
    if (evaluationTimestampMs && months.length > 0) {
      const evalDate = new Date(evaluationTimestampMs);
      const evalMonthKey = `${evalDate.getFullYear()}-${String(evalDate.getMonth() + 1).padStart(2, '0')}`;
      const lastMonthKey = months[months.length - 1].key;

      // If the most active month is the evaluation month or the month before,
      // and burst is elevated, this is suspicious.
      if (lastMonthKey >= evalMonthKey) {
        burstTriggeredAtEval = burstTriggeredAtEval || burstDormancyRatio > 2.0;
      }
    }

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
      `burstRatio=${burstDormancyRatio.toFixed(2)} burstTriggered=${burstTriggeredAtEval} ` +
      `forkRatio=${forkDumpRatio.toFixed(2)} inflationRatio=${commitInflationRatio.toFixed(2)}`,
    );

    return {
      burst_dormancy_ratio: burstDormancyRatio,
      burst_triggered_at_evaluation: burstTriggeredAtEval,
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
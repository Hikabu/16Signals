/**
 * P4 — TECHNICAL DEPTH
 * Can this engineer go deep when the problem genuinely requires it?
 *
 * Corpus groups: B (Repositories), D (Collaboration), F (Impact)
 * Minimum mode: Light.
 *
 * Reference: Analysys_specs_architecture.md Section 3.P4
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class P4TechnicalDepthModule implements AnalysisModule {
  readonly module_id = 'p4_technical_depth';
  readonly primitive_id = 'p4';
  readonly required_corpus_groups: readonly CorpusGroup[] = ['B', 'D', 'F'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter(
      (g) => !corpus.groups_present.includes(g),
    );
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const evidence: Evidence[] = [];
    const repos = corpus.repositories;
    const cd = corpus.collaboration_signals;
    const imp = corpus.impact_signals;

    // Depth by commit volume
    const langCommitMap: Record<string, number> = {};
    for (const repo of repos) {
      if (repo.is_fork || !repo.primary_language) continue;
      langCommitMap[repo.primary_language] = (langCommitMap[repo.primary_language] || 0) + repo.commit_count;
    }
    const sorted = Object.entries(langCommitMap).sort((a, b) => b[1] - a[1]);
    const top2Deep = sorted.slice(0, 2).filter(([, c]) => c >= 200);

    evidence.push({
      signal: 'Depth by commit volume',
      corpus_field: 'repositories[].commit_count,repositories[].primary_language',
      value: { topLanguages: sorted.slice(0, 3), deepThreshold: 200 },
      interpretation: top2Deep.length >= 2
        ? `Top 2 languages have ≥200 commits each — genuine depth.`
        : `Limited commit volume in any single language.`,
    });

    console.log(`[Module:${this.module_id}] phase=evidence signal="Depth by commit volume" deepLanguages=${top2Deep.length}`);

    // Operational depth markers
    const opMarkers = corpus.engineering_practice_signals.observability_markers_present;
    evidence.push({
      signal: 'Operational depth markers',
      corpus_field: 'engineering_practice_signals.observability_markers_present',
      value: opMarkers,
      interpretation: opMarkers.length >= 2
        ? `${opMarkers.length} operational markers detected — logging, metrics, or tracing.`
        : `${opMarkers.length} operational markers.`,
    });

    // Package registry adoption
    const allPackages = [
      ...imp.npm_packages,
      ...imp.pypi_packages,
      ...imp.cargo_packages,
    ];
    const hasAdoption = allPackages.some((p) => p.downloads >= 1000 || p.dependents >= 5);

    evidence.push({
      signal: 'Package registry adoption',
      corpus_field: 'impact_signals.{npm,pypi,cargo}_packages',
      value: { total: allPackages.length, hasAdoption },
      interpretation: hasAdoption
        ? `Package(s) with real-world adoption — one of the strongest signals in the system.`
        : `No packages with significant adoption detected.`,
    });

    console.log(`[Module:${this.module_id}] phase=evidence signal="Package registry adoption" packages=${allPackages.length} adopted=${hasAdoption}`);

    // Hard problem evidence (from PR descriptions, LLM-scored later)
    evidence.push({
      signal: 'Hard problem evidence (LLM)',
      corpus_field: 'collaboration_signals.pr_description_raw',
      value: { sampleSize: cd.pr_description_raw.length },
      interpretation: cd.pr_description_raw.length > 0
        ? `${cd.pr_description_raw.length} PRs available for hard-problem classification.`
        : 'No PR descriptions available for analysis.',
    });

    const confidence = this.determineConfidence(top2Deep.length, opMarkers.length, hasAdoption);

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: this.buildScoreLabel(confidence),
      evidence,
      flags: [],
      interview_probe: confidence === 'strong' ? null : "Tell me about the most technically challenging problem you've solved recently. What made it hard?",
      raw_signals_used: [
        'repositories[].commit_count',
        'repositories[].primary_language',
        'engineering_practice_signals.observability_markers_present',
        'impact_signals.{npm,pypi,cargo}_packages',
        'collaboration_signals.pr_description_raw',
      ],
    };
  }

  private determineConfidence(deepLangs: number, opMarkers: number, hasAdoption: boolean): ModuleResult['confidence'] {
    let score = 0;
    if (deepLangs >= 2) score++;
    if (opMarkers >= 2) score++;
    if (hasAdoption) score += 2; // Very strong signal
    if (score >= 3) return 'strong';
    if (score >= 2) return 'moderate';
    if (score >= 1) return 'low';
    return 'observability_gap';
  }

  private buildScoreLabel(confidence: ModuleResult['confidence']): string {
    switch (confidence) {
      case 'strong': return 'Demonstrated technical depth across multiple dimensions — strong evidence.';
      case 'moderate': return 'Evidenced in limited context — probe in interview to confirm depth.';
      case 'low': return 'One instance detected — insufficient to score.';
      case 'observability_gap': return 'No public evidence — likely private or enterprise context.';
      case 'insufficient_data': return 'Cannot assess from available signals.';
    }
  }
}
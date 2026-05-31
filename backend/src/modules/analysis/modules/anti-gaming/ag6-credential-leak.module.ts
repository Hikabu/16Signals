/**
 * AG6 — CREDENTIAL LEAK DETECTOR (Deep Mode Only)
 * Produces HARD flag when gitleaks detects unrevoked credentials.
 *
 * Corpus groups: E (Engineering Practices — secret_leak fields)
 * Deep Mode only. Light Mode: not available.
 *
 * Reference: Analysys_specs_architecture.md Section 4.AG6
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence, Flag } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

@Injectable()
export class AG6CredentialLeakModule implements AnalysisModule {
  readonly module_id = 'ag6_credential_leak';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['E'];
  readonly required_collection_mode: 'deep' = 'deep';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const evidence: Evidence[] = [];
    const flags: Flag[] = [];
    const ep = corpus.engineering_practice_signals;

    // Light Mode: not available
    if (corpus.collection_mode === 'light' || corpus.collection_mode === 'light_partial') {
      console.log(`[Module:${this.module_id}] phase=skip reason=deep_mode_required mode=${corpus.collection_mode}`);

      return {
        module_id: this.module_id,
        primitive_id: this.primitive_id,
        confidence: 'observability_gap',
        score_label: 'Secret scanning requires Deep Mode analysis — credential leak history cannot be assessed from public signals.',
        evidence: [{
          signal: 'Credential leak — mode gate',
          corpus_field: 'collection_mode',
          value: corpus.collection_mode,
          interpretation: 'Deep Mode required for secret scanning. Light Mode cannot assess credential leaks.',
        }],
        flags: [],
        interview_probe: null,
        raw_signals_used: ['collection_mode'],
      };
    }

    // Deep Mode: evaluate secret leaks
    evidence.push({
      signal: 'Secret leak detection',
      corpus_field: 'engineering_practice_signals.secret_leak_detected',
      value: ep.secret_leak_detected,
      interpretation: ep.secret_leak_detected ? 'Credentials detected in git history.' : 'No credentials detected.',
    });

    if (ep.secret_leak_detected) {
      // Apply false positive filter
      const hardLeaks = ep.secret_leak_details.filter(
        (d) =>
          !/test\/|fixture\/|example\/|mock\//.test(d.file_path) &&
          !/YOUR_.*HERE|xxx+|placeholder/.test(d.secret_type),
      );

      const softLeaks = ep.secret_leak_details.length - hardLeaks.length;

      evidence.push({
        signal: 'Hard vs soft leak count',
        corpus_field: 'engineering_practice_signals.secret_leak_details',
        value: { total: ep.secret_leak_details.length, hard: hardLeaks.length, soft: softLeaks },
        interpretation: `${hardLeaks.length} hard leak(s), ${softLeaks} false positive(s).`,
      });

      // HARD flag for confirmed leaks
      if (hardLeaks.length > 0) {
        for (const leak of hardLeaks) {
          flags.push({
            flag_id: `CREDENTIAL_LEAK_${leak.secret_type.replace(/\s+/g, '_').toUpperCase()}`,
            flag_type: 'HARD',
            severity: 'CRITICAL',
            module_id: this.module_id,
            description: `Credential leak detected: ${leak.secret_type} in ${leak.file_path} (repo: ${leak.repo})`,
            evidence_paths: [
              `engineering_practice_signals.secret_leak_details[${leak.file_path}]`,
            ],
            escalate_to_hiring_manager: true,
            clear_without_interview: false,
            auto_reject: false,
            interview_probe: `I noticed a credential was committed to your repository at ${leak.repo}. Can you walk me through what happened and how you handled the remediation?`,
          });
        }

        console.log(
          `[Module:${this.module_id}] phase=flag_raised count=${hardLeaks.length} ` +
          `types=${hardLeaks.map((l) => l.secret_type).join(',')}`,
        );
      }

      // SOFT flag for false positives
      if (softLeaks > 0) {
        flags.push({
          flag_id: 'CREDENTIAL_LEAK_SOFT_FP',
          flag_type: 'SOFT',
          severity: 'INFO',
          module_id: this.module_id,
          description: `${softLeaks} potential credential exposure(s) in test/fixture files.`,
          evidence_paths: [],
          escalate_to_hiring_manager: false,
          clear_without_interview: true,
          auto_reject: false,
          interview_probe: 'Potential credential exposure detected in what appears to be a test fixture — verify in interview that this is intentionally non-functional.',
        });
      }
    }

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence: flags.length > 0 ? 'low' : 'strong',
      score_label: flags.length > 0
        ? 'Credential leak flag raised. See Section D.'
        : 'No credential leaks detected.',
      evidence,
      flags,
      interview_probe: null,
      raw_signals_used: [
        'engineering_practice_signals.secret_leak_detected',
        'engineering_practice_signals.secret_leak_details',
      ],
    };
  }
}
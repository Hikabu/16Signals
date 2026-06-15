/**
 * EV — EMPLOYMENT VERIFICATION MODULE
 * Verifies claimed employment via email domain (Rung 1), org membership (Rung 2),
 * and contribution fingerprint (Rung 3).
 *
 * Corpus groups: A (Identity), C (Commit Intelligence)
 * Rung 1: Light Mode capable. Rungs 2-3: Deep Mode only.
 *
 * Reference: Analysys_specs_architecture.md Section 4.EV
 */

import { Injectable } from '@nestjs/common';
import { AnalysisModule, AnalysisConfig } from '../module.interface';
import { ModuleResult, Evidence } from '../module-result.types';
import { SignalCorpus, CorpusGroup } from '../../corpus/corpus.types';

interface RungResult {
  level: number;
  status: 'confirmed' | 'unconfirmed' | 'partial';
  description: string;
}

@Injectable()
export class EVEmploymentVerificationModule implements AnalysisModule {
  readonly module_id = 'ev_employment_verification';
  readonly primitive_id = null;
  readonly required_corpus_groups: readonly CorpusGroup[] = ['A', 'C'];
  readonly required_collection_mode: 'either' = 'either';

  preflight(corpus: SignalCorpus): CorpusGroup[] {
    return this.required_corpus_groups.filter((g) => !corpus.groups_present.includes(g));
  }

  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult {
    console.log(`[Module:${this.module_id}] phase=run_start username=${corpus.github_username}`);

    const identity = corpus.identity;
    const cs = corpus.commit_signals;
    const evidence: Evidence[] = [];
    const rungs: RungResult[] = [];

    // Rung 0: No signal
    const companyClaim = identity.company_claim;
    if (!companyClaim) {
      console.log(`[Module:${this.module_id}] phase=rung0 no_company_claim`);
      return {
        module_id: this.module_id,
        primitive_id: this.primitive_id,
        confidence: 'observability_gap',
        score_label: 'Rung 0 — No verifiable signal. No employer claim in GitHub bio.',
        evidence: [{
          signal: 'Employment verification — Rung 0',
          corpus_field: 'identity.company_claim',
          value: null,
          interpretation: 'No employer claim in GitHub bio. Cannot perform employment verification.',
        }],
        flags: [],
        interview_probe: 'Can you describe your engineering environment at your current employer — what version control system did you use?',
        raw_signals_used: ['identity.company_claim'],
      };
    }

    // Rung 1: Email domain match
    const emailDomains = identity.commit_email_domains;
    const claimedCompanyDomain = this.claimToDomain(companyClaim);
    const domainMatch = emailDomains.find((d) =>
      d.toLowerCase().includes(claimedCompanyDomain.toLowerCase()),
    );

    if (domainMatch) {
      rungs.push({
        level: 1,
        status: 'confirmed',
        description: `Email domain match confirmed (@${domainMatch}) for ${companyClaim}.`,
      });
      console.log(`[Module:${this.module_id}] phase=rung1 confirmed domain=${domainMatch} claim=${companyClaim}`);
    } else {
      rungs.push({
        level: 1,
        status: 'unconfirmed',
        description: `No email domain match for ${companyClaim}. Tried: ${claimedCompanyDomain}*`,
      });
      console.log(`[Module:${this.module_id}] phase=rung1 unconfirmed claim=${companyClaim}`);
    }

    // Rung 2: Org membership (Deep Mode)
    const orgMemberships = identity.github_org_memberships;
    const claimedOrgSlug = this.claimToOrgSlug(companyClaim);
    const orgMatch = orgMemberships.find((o) =>
      o.toLowerCase().includes(claimedOrgSlug.toLowerCase()),
    );

    if (orgMatch) {
      rungs.push({
        level: 2,
        status: 'confirmed',
        description: `GitHub org membership confirmed: @${orgMatch} for ${companyClaim}.`,
      });
      console.log(`[Module:${this.module_id}] phase=rung2 confirmed org=${orgMatch}`);
    } else if (corpus.collection_mode === 'deep' || corpus.collection_mode === 'deep_partial') {
      rungs.push({
        level: 2,
        status: 'unconfirmed',
        description: `No org membership found for ${companyClaim} despite Deep Mode.`,
      });
      console.log(`[Module:${this.module_id}] phase=rung2 unconfirmed claim=${companyClaim}`);
    } else {
      rungs.push({
        level: 2,
        status: 'partial',
        description: 'Org membership check requires Deep Mode.',
      });
    }

    // Rung 3: Contribution fingerprint (Deep Mode only)
    if (corpus.collection_mode === 'deep' || corpus.collection_mode === 'deep_partial') {
      const totalCommits = cs.sampled_commit_count;
      if (totalCommits > 0 && orgMatch) {
        rungs.push({
          level: 3,
          status: 'confirmed',
          description: `Contribution fingerprint: ${totalCommits} lifetime commits with org access.`,
        });
        console.log(`[Module:${this.module_id}] phase=rung3 confirmed commits=${totalCommits}`);
      } else {
        rungs.push({
          level: 3,
          status: 'unconfirmed',
          description: 'Insufficient commit data or no org match to confirm contribution fingerprint.',
        });
        console.log(`[Module:${this.module_id}] phase=rung3 unconfirmed`);
      }
    } else {
      rungs.push({
        level: 3,
        status: 'partial',
        description: 'Contribution fingerprint analysis requires Deep Mode.',
      });
    }

    // Build evidence from all rungs
    for (const rung of rungs) {
      evidence.push({
        signal: `Employment verification — Rung ${rung.level}`,
        corpus_field: rung.level === 1
          ? 'identity.commit_email_domains'
          : rung.level === 2
            ? 'identity.github_org_memberships'
            : 'commit_signals.sampled_commit_count',
        value: { companiesClaimed: [companyClaim], emailDomains, orgMemberships },
        interpretation: rung.description,
      });
    }

    const highestRung = rungs.filter((r) => r.status === 'confirmed').length;
    const confidence = highestRung >= 2 ? 'strong' : highestRung >= 1 ? 'moderate' : 'low';

    console.log(
      `[Module:${this.module_id}] phase=run_complete confidence=${confidence} ` +
      `highestRung=${highestRung} totalRungs=${rungs.length}`,
    );

    return {
      module_id: this.module_id,
      primitive_id: this.primitive_id,
      confidence,
      score_label: confidence === 'strong'
        ? `Employment verified: Rung ${highestRung}/3 confirmed for ${companyClaim}.`
        : `Employment partially verified: Rung ${highestRung}/3.`,
      evidence,
      flags: [],
      interview_probe: confidence === 'strong'
        ? null
        : `Can you describe your engineering environment at ${companyClaim} — what version control system did you use?`,
      raw_signals_used: [
        'identity.company_claim',
        'identity.commit_email_domains',
        'identity.github_org_memberships',
        'commit_signals.sampled_commit_count',
      ],
    };
  }

  private claimToDomain(claim: string): string {
    // 'Acme Corp' → try acme.com, acmecorp.com, acme.io
    const slug = claim.toLowerCase().replace(/[^a-z0-9]/g, '');
    const commonDomains = [
      `${slug}.com`,
      `${slug.replace(/corp|inc|llc/g, '')}.com`,
      `${slug}corp.com`,
      `${slug}.io`,
    ];
    console.log(`[Module:ev_employment] phase=domain_mapping claim=${claim} domains=${commonDomains.join(',')}`);
    return commonDomains[0]; // Return primary domain for matching
  }

  private claimToOrgSlug(claim: string): string {
    // 'Acme Corp' → 'acme-corp' or 'acmecorp'
    const slug = claim.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/\s+/g, '-');
    console.log(`[Module:ev_employment] phase=org_mapping claim=${claim} orgSlug=${slug}`);
    return slug;
  }
}
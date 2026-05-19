import { Injectable } from '@nestjs/common';
import type { InteractionProfile } from './interaction-profile.service';

export const SOLANA_TOPICS = [
  'solana',
  'anchor',
  'anchor-lang',
  'solana-program',
  'spl-token',
  'metaplex',
  'web3js',
  'program-derived-address',
  'solana-web3',
  'coral-xyz',
  'helius',
  'jito',
  'drift',
];

export const SOLANA_ECOSYSTEM_REPOS = [
  'solana-labs/solana',
  'coral-xyz/anchor',
  'metaplex-foundation/mpl-token-metadata',
  'jito-foundation/jito-solana',
  'helius-labs/helius-sdk',
  'orca-so/whirlpools',
  'drift-protocol/protocol-v2',
  'openbook-dex/openbook-v2',
  'solana-developers/program-examples',
  'solana-developers/solana-cookbook',
];

export interface EcosystemSignals {
  ecosystemIdentity: 'solana' | null;
  ecosystemPRs: number;
}

@Injectable()
export class EcosystemClassifierService {
  detectEcosystemIdentity(
    repos: { name?: string; topics?: string[]; description?: string | null }[],
    interactionProfile: InteractionProfile | null = null,
  ): 'solana' | null {
    if (!repos || !Array.isArray(repos)) {
      return interactionProfile?.ecosystemAffinity === 'solana'
        ? 'solana'
        : null;
    }

    for (const repo of repos) {
      if (repo.topics && Array.isArray(repo.topics)) {
        for (const topic of repo.topics) {
          if (SOLANA_TOPICS.includes(topic.toLowerCase())) {
            return 'solana';
          }
        }
      }
    }

    if (interactionProfile?.ecosystemAffinity === 'solana') {
      return 'solana';
    }

    return null;
  }

  countEcosystemPRs(externalPRs: { repo: string }[]): number {
    if (!externalPRs || !Array.isArray(externalPRs)) {
      return 0;
    }

    let count = 0;
    for (const pr of externalPRs) {
      if (pr.repo && SOLANA_ECOSYSTEM_REPOS.includes(pr.repo)) {
        count++;
      }
    }

    return count;
  }
}

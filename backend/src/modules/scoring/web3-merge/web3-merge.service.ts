import { Injectable } from '@nestjs/common';
import { AnalysisResult } from '../types/result.types';
import { ProgramInfo } from '../web3-adapter/solana-adapter.service';

@Injectable()
export class Web3MergeService {
  applyWalletUpgrades(
    result: AnalysisResult,
    programs: ProgramInfo[],
    languages: string[],
  ): AnalysisResult {
    // Structural clone to avoid mutating the original
    const updatedResult: AnalysisResult = JSON.parse(JSON.stringify(result));

    const hasRust = languages.includes('Rust');
    const deployedPrograms = programs.length;

    // Upgrade backend confidence
    if (
      updatedResult.capabilities?.backend &&
      hasRust &&
      deployedPrograms > 0
    ) {
      if (updatedResult.capabilities.backend.confidence === 'low') {
        updatedResult.capabilities.backend.confidence = 'medium';
      } else if (updatedResult.capabilities.backend.confidence === 'medium') {
        updatedResult.capabilities.backend.confidence = 'high';
      }
    }

    const hasActiveProgramWithCallers = programs.some(
      (p) => p.isActive && p.uniqueCallers > 0,
    );

    // Upgrade impact activityLevel
    if (updatedResult.impact?.activityLevel) {
      if (
        updatedResult.impact.activityLevel === 'low' &&
        hasActiveProgramWithCallers
      ) {
        updatedResult.impact.activityLevel = 'medium';
      }
    }

    // Upgrade consistency when programs are actively and frequently upgraded
    const totalUpgradeCount = programs.reduce(
      (sum, p) => sum + (p.upgradeCount ?? 0),
      0,
    );
    const hasActiveProgram = programs.some((p) => p.isActive);

    if (totalUpgradeCount > 5 && hasActiveProgram) {
      if (updatedResult.impact.consistency === 'sparse') {
        updatedResult.impact.consistency = 'moderate';
      } else if (updatedResult.impact.consistency === 'moderate') {
        updatedResult.impact.consistency = 'strong';
      }
    }

    return updatedResult;
  }

  applyVouchUpgrades(
    result: AnalysisResult,
    vouchCount: number,
    verifiedVouchCount: number,
    activeVouches: any[],
  ): AnalysisResult {
    const updatedResult: AnalysisResult = JSON.parse(JSON.stringify(result));

    // Upgrade rules (same pattern as wallet, can only upgrade, never downgrade):
    if (verifiedVouchCount >= 2) {
      if (updatedResult.impact.confidence === 'low') {
        updatedResult.impact.confidence = 'medium';
      } else if (updatedResult.impact.confidence === 'medium') {
        updatedResult.impact.confidence = 'high';
      }
    }

    if (verifiedVouchCount >= 5) {
      updatedResult.impact.confidence = 'high';
    }

    updatedResult.reputation =
      vouchCount === 0
        ? null
        : {
            vouchCount,
            verifiedVouchCount,
            confidence:
              vouchCount >= 3 ? 'high' : vouchCount >= 1 ? 'medium' : 'low',
            vouches: activeVouches.map((v) => ({
              voucherWallet:
                v.voucherWallet.slice(0, 4) + '...' + v.voucherWallet.slice(-4),
              message: v.message,
              weight: v.weight as 'verified' | 'standard' | 'new',
              confirmedAt: v.confirmedAt.toISOString(),
              expiresAt: v.expiresAt.toISOString(),
            })),
          };

    return updatedResult;
  }
}

/**
 * SeniorityWeightingService — Applies seniority-based adjustments to module results.
 *
 * Different seniority levels have different expectations:
 *   Intern/Junior:  CI/CD, testing, and observability not expected
 *   Mid:            Standard expectations
 *   Senior/Staff:   Higher bar for collaboration, system design, mentorship
 *   Principal:      Highest bar — technical leadership, org-wide impact
 *
 * The service adjusts confidence levels and adds contextual notes
 * but NEVER computes composite scores (prohibited per spec).
 *
 * Reference: Analysys_specs_architecture.md Section 3
 */

import { Injectable } from '@nestjs/common';
import { ModuleResult } from '../modules/module-result.types';
import { AnalysisConfig } from '../modules/module.interface';

export interface WeightedModuleResult extends ModuleResult {
  /** Seniority-adjusted confidence (may differ from original) */
  adjusted_confidence: ModuleResult['confidence'];
  /** Context note explaining the adjustment */
  adjustment_note: string | null;
}

@Injectable()
export class SeniorityWeightingService {
  /**
   * Apply seniority weighting to all module results.
   * Returns a new array with weighted results; original is not mutated.
   */
  apply(
    results: ModuleResult[],
    config: AnalysisConfig,
  ): WeightedModuleResult[] {
    return results.map((result) => this.weightModule(result, config));
  }

  private weightModule(
    result: ModuleResult,
    config: AnalysisConfig,
  ): WeightedModuleResult {
    const isJunior =
      config.seniority === 'intern' || config.seniority === 'junior';
    const isSenior = config.seniority === 'senior';
    const isStaff = config.seniority === 'staff' || config.seniority === 'principal';

    // Default: no adjustment
    let adjustedConfidence = result.confidence;
    let adjustmentNote: string | null = null;

    switch (result.primitive_id) {
      case 'p1': // Execution Reliability
        if (isJunior && result.confidence === 'observability_gap') {
          adjustedConfidence = 'low';
          adjustmentNote = 'CI/CD and testing not expected at junior level.';
        }
        if (isSenior && result.confidence === 'strong') {
          adjustedConfidence = 'strong';
          adjustmentNote = 'Strong execution for senior level — independently validated.';
        }
        break;

      case 'p2': // Systems Evolution
        if (isJunior && result.confidence === 'observability_gap') {
          adjustedConfidence = 'moderate';
          adjustmentNote = 'Systems evolution expected to grow with experience.';
        }
        break;

      case 'p3': // Collaboration Leverage
        if (isStaff && result.confidence === 'moderate') {
          adjustedConfidence = 'low';
          adjustmentNote = 'Staff-level engineers expected to demonstrate strong collaboration patterns.';
        }
        break;

      case 'p4': // Technical Depth
        if (isStaff && result.confidence === 'moderate') {
          adjustmentNote = 'Staff-level — technical depth should be independently verified in interview.';
        }
        break;

      case 'p5': // Operational Maturity
        if (isJunior) {
          if (result.confidence === 'observability_gap') {
            adjustedConfidence = 'moderate';
            adjustmentNote = 'Operational maturity not expected at junior level.';
          }
        }
        break;

      case 'p6': // AI Leverage
        // No seniority adjustment — AI skill is not seniority-correlated per spec
        break;

      case 'p7': // Authenticity Confidence
        // No seniority adjustment
        break;

      default:
        // AG modules: no seniority adjustment
        break;
    }

    return {
      ...result,
      adjusted_confidence: adjustedConfidence,
      adjustment_note: adjustmentNote,
    };
  }
}
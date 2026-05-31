/**
 * Analysis Module Interface
 *
 * Every analysis module implements this interface.
 * No module may make external API calls — all required data must be in the Signal Corpus.
 *
 * Reference: Analysys_specs_architecture.md Section 1.3
 */

import { SignalCorpus, CorpusGroup } from '../corpus/corpus.types';
import { ModuleResult } from './module-result.types';

/**
 * A single claim extracted from a candidate's CV/resume.
 * Used by the EV module and Brief Assembler Section B for
 * claim-by-claim cross-referencing against the Signal Corpus.
 */
export interface CvClaim {
  /** Type of claim */
  type: 'company' | 'role' | 'date_range' | 'tech_stack' | 'education';
  /** The claimed value (e.g. 'Google', 'Senior Engineer', '2019-2022') */
  value: string;
  /** How clearly the claim was stated in the CV */
  confidence: 'explicit' | 'inferred' | 'ambiguous';
  /** Raw text snippet the claim was extracted from */
  source_text: string;
}

/**
 * Analysis configuration passed to every module at runtime.
 * Determines seniority adjustments and role archetype weighting.
 */
export interface AnalysisConfig {
  seniority:
    | 'intern'
    | 'junior'
    | 'mid'
    | 'senior'
    | 'staff'
    | 'principal';
  role_archetype:
    | 'backend'
    | 'frontend'
    | 'platform'
    | 'data_ml'
    | 'security'
    | 'mobile'
    | 'generalist';
  jd_text?: string;
  /**
   * Optional CV claims for cross-referencing against the Signal Corpus.
   * Populated by the CV Claim Extractor service (Stage 6).
   * When present, the EV module enriches its analysis with claim-by-claim
   * verification, and the Brief Assembler Section B renders a detailed
   * cross-reference table.
   */
  cv_claims?: CvClaim[];
}

/**
 * Core module contract. Every analysis module (P1–P7, AG1–AG6, EV)
 * implements this interface.
 */
export interface AnalysisModule {
  /** Unique identifier, e.g. 'p1_execution_reliability' */
  readonly module_id: string;

  /** Primitive ID ('p1'–'p7') or null for anti-gaming/EV modules */
  readonly primitive_id: string | null;

  /** Corpus groups required for this module to run */
  readonly required_corpus_groups: readonly CorpusGroup[];

  /** Minimum collection mode required */
  readonly required_collection_mode: 'light' | 'deep' | 'either';

  /**
   * Execute the module analysis.
   * @param corpus - The Signal Corpus (all required groups must be present)
   * @param config - Analysis configuration (seniority, role archetype, JD)
   * @returns Structured ModuleResult with confidence, evidence, flags, and probe
   */
  run(corpus: SignalCorpus, config: AnalysisConfig): ModuleResult;

  /**
   * Pre-flight check: returns the list of missing corpus groups.
   * If the returned array is non-empty, the module should NOT be executed.
   * @param corpus - The Signal Corpus to check
   * @returns Array of missing CorpusGroup identifiers
   */
  preflight(corpus: SignalCorpus): CorpusGroup[];
}
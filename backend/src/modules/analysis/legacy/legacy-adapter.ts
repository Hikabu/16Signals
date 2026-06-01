/**
 * Legacy Migration Adapter
 *
 * Provides a backward-compatible migration path for consumers of the legacy
 * /api/analysis endpoints. Logs deprecation warnings and routes requests to
 * the corresponding v2 endpoints where possible.
 *
 * Usage: Import in ScoringModule to intercept legacy requests and redirect
 * to AnalysisV2Controller endpoints.
 *
 * Migration Timeline:
 *   - Current (Q2 2026): Both systems run in parallel; legacy emits deprecation warnings
 *   - Q3 2026: Legacy endpoints return 301 redirect to v2
 *   - Q4 2026: Legacy endpoints removed
 *
 * Reference: MIGRATION_PLAN_TO_TARGET_ARCHITECTURE.md Phase 4
 */

import { Injectable, Logger } from '@nestjs/common';

/** Request shape compatible with legacy CreateAnalysisDto */
export interface LegacyAnalysisRequest {
  githubUsername?: string;
  walletAddress?: string;
  force?: boolean;
  config?: {
    seniority?: string;
    role_archetype?: string;
  };
}

/** Response shape compatible with legacy job responses */
export interface LegacyAnalysisResponse {
  jobId: string;
  status?: string;
  cached?: boolean;
  result?: unknown;
  /** Whether this response came from the v2 pipeline */
  migrated?: boolean;
  /** Migration message for API consumers */
  migrationNotice?: string;
}

@Injectable()
export class LegacyMigrationAdapter {
  private readonly logger = new Logger(LegacyMigrationAdapter.name);

  /**
   * Maps a legacy analysis request to v2-equivalent parameters.
   * Only handles githubUsername-based requests; wallet-only requests
   * are not supported in v2 and should remain on legacy.
   */
  mapRequestToV2(request: LegacyAnalysisRequest): {
    githubUsername: string;
    seniority: string;
    role_archetype: string;
  } | null {
    if (!request.githubUsername) {
      this.logger.warn(
        `[LegacyAdapter] phase=unsupported_request reason=no_github_username ` +
        `walletOnly=${!!request.walletAddress}`,
      );
      return null;
    }

    return {
      githubUsername: request.githubUsername,
      seniority: request.config?.seniority ?? 'mid',
      role_archetype: request.config?.role_archetype ?? 'generalist',
    };
  }

  /**
   * Wraps a legacy response with migration metadata.
   * Logs a deprecation warning for API consumers.
   */
  wrapLegacyResponse(legacyResult: unknown): LegacyAnalysisResponse & { migrationNotice: string } {
    this.logger.warn(
      `[LegacyAdapter] phase=legacy_call_detected ` +
      `message=This endpoint is deprecated. Migrate to POST /api/v2/analysis/light. ` +
      `Support ends Q4 2026.`,
    );

    return {
      jobId: (legacyResult as any)?.jobId ?? 'legacy-fallback',
      status: 'complete',
      result: legacyResult,
      migrated: false,
      migrationNotice:
        'DEPRECATED: This endpoint is being phased out. ' +
        'Please migrate to POST /api/v2/analysis/light. ' +
        'See /api/docs for full v2 API documentation. ' +
        'Legacy support ends Q4 2026.',
    };
  }

  /**
   * Builds a deprecation header for HTTP responses.
   * Callers should add this to their response headers.
   */
  getDeprecationHeaders(): Record<string, string> {
    return {
      Deprecation: 'true',
      Sunset: 'Wed, 31 Dec 2026 23:59:59 GMT',
      Link: '</api/v2/analysis/light>; rel="successor-version"',
      'X-Migration-Guide': 'https://api.16signals.com/docs/migration-to-v2',
    };
  }
}
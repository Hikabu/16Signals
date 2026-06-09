import { PrismaService } from '../../../prisma/prisma.service';
import { EvidenceBriefOutput } from '../llm/llm-response.types';

export async function resolveGithubProfileId(
  prisma: PrismaService,
  username: string,
): Promise<string> {
  const existing = await prisma.githubProfile.findUnique({
    where: { githubUsername: username },
    select: { id: true },
  });
  if (existing) return existing.id;

  const newProfile = await prisma.githubProfile.create({
    data: {
      githubUsername: username,
      githubUserId: `anon_${username}_${Date.now()}`,
      encryptedToken: '',
      scopes: [],
    },
  });
  return newProfile.id;
}

/**
 * Build the full analysis result stored in AnalysisJob.result.
 *
 * Takes the canonical EvidenceBriefOutput and preserves ALL fields so the
 * polling endpoint (GET /api/v2/analysis/:jobId) returns complete data.
 *
 * Deep Mode: if cloneStats are provided, they are merged into the result.
 */
export function buildFullResult(
  brief: EvidenceBriefOutput,
  cloneStats?: {
    reposCloned: number;
    reposSucceeded: number;
    reposFailed: number;
    totalCloneTimeMs: number;
    secretLeaksFound: number;
  },
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    // ── Identity ──
    jobId: brief.jobId,
    status: brief.status,

    // ── Rendering ──
    briefMarkdown: brief.briefMarkdown,

    // ── Structured Sections ──
    sections: brief.sections,

    // ── Primitives ──
    primitives: brief.primitives,
    primitiveScores: brief.primitiveScores,

    // ── Flags ──
    flags: brief.flags,
    flagCount: brief.flagCount,

    // ── Interview ──
    interviewQuestions: brief.interviewQuestions,

    // ── Raw Module Data ──
    moduleResults: brief.moduleResults,
    moduleCount: brief.moduleResults.length,

    // ── Metadata ──
    metadata: brief.metadata,
    totalDurationMs: brief.totalDurationMs,
  };

  // Merge Deep Mode clone stats if provided
  if (cloneStats) {
    result.cloneStats = cloneStats;
  }

  return result;
}
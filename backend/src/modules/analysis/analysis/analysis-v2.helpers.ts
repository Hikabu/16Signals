import { PrismaService } from '../../../prisma/prisma.service';

import { ModuleResult } from '../modules/module-result.types';

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

export function buildFullResult(
  briefMarkdown: string,
  briefJson: Record<string, string>,
  moduleResults: ModuleResult[],
  flags: Array<{
    flag_id: string;
    flag_type: 'SOFT' | 'HARD';
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    module_id: string;
    description: string;
    escalate_to_hiring_manager: boolean;
    clear_without_interview: boolean;
    interview_probe: string | null;
  }>,
  totalDurationMs: number,
) {
  return {
    briefMarkdown,
    briefJson,
    moduleResults: moduleResults.map((r) => ({
      module_id: r.module_id,
      primitive_id: r.primitive_id,
      confidence: r.confidence,
      score_label: r.score_label,
      evidence: r.evidence,
      flags: r.flags,
      interview_probe: r.interview_probe,
      raw_signals_used: r.raw_signals_used,
    })),
    flags,
    moduleCount: moduleResults.length,
    flagCount: flags.length,
    totalDurationMs,
  } as any;
}

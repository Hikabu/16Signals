import { z } from 'zod';
import { Seniority, RiskLevel } from '@prisma/client';

/**
 * Capability item (structured UI representation)
 */
export const CapabilityItemSchema = z.object({
  key: z.enum(['backend', 'frontend', 'devops']),
  label: z.string(),
  score: z.number().min(0).max(1),
  displayScore: z.number().min(0).max(100),
  confidence: z.string(),
  strength: z.enum(['strong', 'moderate', 'weak']),
});

/**
 * Core UI Scorecard Schema (FINAL MERGED VERSION)
 */
export const ScorecardUiSchema = z.object({
  profile: z.object({
    username: z.string().describe('GitHub username of the candidate'),
    avatarUrl: z.string().url().optional(),
    summary: z.string(),
  }),

  score: z.object({
    value: z.number().min(0).max(100),
    percentile: z.number().min(0).max(100),
    isWithheld: z.object({
      value: z.boolean(),
      reason: z.string().optional(),
    }),
  }),

  trust: z.object({
    level: z.string(), // FULL | PARTIAL | LOW | MINIMAL (kept flexible)
    risk: z.nativeEnum(RiskLevel),
    label: z.string(),
    guidance: z.string(),
  }),

  insights: z.object({
    // structured capabilities (replaces string[])
    capabilities: z.array(CapabilityItemSchema),

    // narrative layer (for UI / recruiter explanation)
    highlights: z.array(z.string()),
    gaps: z.array(z.string()),
    caveats: z.array(z.string()),

    // raw structured breakdown (important for debugging + UI expansion)
    ownership: z.object({
      ownedProjects: z.number(),
      activelyMaintained: z.number(),
      confidence: z.string(),
    }),

    impact: z.object({
      activityLevel: z.string(),
      consistency: z.string(),
      externalContributions: z.number(),
      confidence: z.string(),
    }),

    reputation: z.any().nullable().optional(),
    privateWorkNote: z.string().optional(),
    organizations: z.array(z.any()).optional(),
    interactionProfile: z.any().nullable().optional(),
    stack: z
      .object({
        languages: z.array(z.string()),
        tools: z.array(z.string()),
      })
      .optional(),
    web3: z.any().nullable().optional(),
  }),
});

/**
 * Full API Response
 */
export const ScorecardResponseSchema = z.object({
  ui: ScorecardUiSchema,
  raw: z.any(), // internal scoring object (audit/debug)
});

/**
 * Preview Request
 */
export const ScorecardPreviewRequestSchema = z.object({
  githubUsername: z.string().min(1),
});

export type ScorecardUiDto = z.infer<typeof ScorecardUiSchema>;
export type CapabilityItem = z.infer<typeof CapabilityItemSchema>;

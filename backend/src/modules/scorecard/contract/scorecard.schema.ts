import { z } from 'zod';
import { Seniority, RiskLevel } from '@prisma/client';

export const RawScorecardSchema = z.object({
  summary: z.string(),

  capabilities: z.object({
    backend: z.object({
      score: z.number(),
      confidence: z.string(),
    }),
    frontend: z.object({
      score: z.number(),
      confidence: z.string(),
    }),
    devops: z.object({
      score: z.number(),
      confidence: z.string(),
    }),
  }),

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

  reputation: z
    .object({
      vouchCount: z.number(),
      verifiedVouchCount: z.number(),
      confidence: z.string(),
      vouches: z.array(z.any()),
    })
    .nullable()
    .optional(),

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
  schemaVersion: z.string()
});

export type RawScorecard = z.infer<typeof RawScorecardSchema>;

/**
 * Capability item (from raw.capabilities)
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
 * UI Schema
 */
export const ScorecardUiSchema = z.object({
  profile: z.object({
    username: z.string(),
    avatarUrl: z.string().url().optional(),
    primaryCohort: z.string(),
    seniority: z.nativeEnum(Seniority),
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
    level: z.string(),
    risk: z.nativeEnum(RiskLevel),
    label: z.string(),
    guidance: z.string(),
  }),

  insights: z.object({
    capabilities: z.array(CapabilityItemSchema),

    highlights: z.array(z.string()),
    gaps: z.array(z.string()),
    caveats: z.array(z.string()),

    //  include raw-derived structured info (useful for UI)
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

export type ScorecardUiDto = z.infer<typeof ScorecardUiSchema>;

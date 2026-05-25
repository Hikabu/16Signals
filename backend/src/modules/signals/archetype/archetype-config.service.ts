// PHASE 2.9 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';

export type RoleArchetype = 'ai_operator' | 'ai_architect' | 'ai_passenger' | 'traditional_engineer' | 'disclosure_flag' | string;

export interface ArchetypeConfig {
  minimumRung: number;
  weightOverrides?: Record<string, number>;
}

@Injectable()
export class ArchetypeConfigService {
  constructor() {}

  getConfig(archetype: RoleArchetype): ArchetypeConfig {
    throw new Error('not implemented');
  }
}

/**
 * LLM Module — Wires Deepseek v4 client, prompt templates, and integration
 * service into the NestJS DI container.
 *
 * Provides LLMIntegrationService to the WaveOrchestrator (Stage 3) and
 * BriefAssembler (Stage 6).
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DeepseekClient } from './deepseek-client';
import { LLMIntegrationService } from './llm-integration.service';
import { LLMPromptTemplates } from './llm-prompt-templates';

@Module({
  imports: [ConfigModule],
  providers: [
    DeepseekClient,
    LLMPromptTemplates,
    LLMIntegrationService,
  ],
  exports: [LLMIntegrationService],
})
export class LLMModule {}
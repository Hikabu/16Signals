/**
 * LLM Module — Wires the swappable LLM provider, prompt templates, and
 * integration service into the NestJS DI container.
 *
 * Provider binding:
 *   LLM_CLIENT → GeminiClient (Google Gemini via @google/genai)
 *
 * To swap to a different LLM provider (e.g. OpenAI, Claude):
 *   1. Create a new class implementing LlmClient
 *   2. Change the useClass binding below to the new provider
 *   3. Add any required environment variables
 *
 * No other files need to change — LLMIntegrationService consumes the
 * LLM_CLIENT token, not any concrete implementation.
 *
 * Environment:
 *   GOOGLE_AI_API_KEY  — Google AI API key (required)
 *   LLM_MODEL          — Model name (default: gemini-2.5-flash)
 *   LLM_MAX_TOKENS     — Max output tokens (default: 4096)
 *   LLM_TEMPERATURE    — Temperature 0-1 (default: 0)
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5 (refactored for Gemini)
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLM_CLIENT } from './llm-client.interface';
import { GeminiClient } from './gemini-client';
import { LLMIntegrationService } from './llm-integration.service';
// import { LLMPromptTemplates } from './llm-prompt-templates';

@Module({
  imports: [ConfigModule],
  providers: [
    GeminiClient,
    // LLMPromptTemplates,
    LLMIntegrationService,
    {
      provide: LLM_CLIENT,
      useExisting: GeminiClient,
    },
  ],
  exports: [LLMIntegrationService],
})
export class LLMModule {}
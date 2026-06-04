/**
 * LlmClient — Swappable LLM provider interface.
 *
 * Any LLM provider (Gemini, OpenAI, Deepseek, Claude) implements this
 * interface. Swap providers by changing the binding in LLMModule without
 * touching LLMIntegrationService or any consumer.
 *
 * Reference: MIGRATION_PLAN_TO_TARGET_ARCHITECTURE.md Stage 5
 */

export interface LlmOptions {
  temperature?: number;
  maxTokens?: number;
  requireJson?: boolean;
  maxRetries?: number;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');

export interface LlmClient {
  chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<string>;

  chatCompletionWithRetry(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<string>;
}
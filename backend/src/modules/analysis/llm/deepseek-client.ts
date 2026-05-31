/**
 * DeepseekClient — OpenAI-compatible HTTP client for Deepseek v4.
 *
 * Architecture: Thin wrapper around the OpenAI SDK configured for Deepseek's API.
 * Provides retry logic with exponential backoff, JSON mode support, and tracing.
 *
 * Environment variables:
 *   DEEPSEEK_API_KEY      — API key
 *   DEEPSEEK_BASE_URL     — Base URL (e.g. https://api.deepseek.com/v1)
 *   DEEPSEEK_MODEL        — Model name (e.g. deepseek-chat)
 *   DEEPSEEK_MAX_TOKENS   — Max tokens per response (default 4096)
 *   DEEPSEEK_TEMPERATURE  — Temperature (default 0 for deterministic)
 *   DEEPSEEK_TIMEOUT_MS   — Timeout (default 35000)
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class DeepseekClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.getOrThrow<string>('DEEPSEEK_API_KEY'),
      baseURL: this.config.getOrThrow<string>('DEEPSEEK_BASE_URL'),
      timeout: this.config.get<number>('DEEPSEEK_TIMEOUT_MS', 35000),
      maxRetries: 2,
    });
    this.model = this.config.getOrThrow<string>('DEEPSEEK_MODEL');
    this.maxTokens = this.config.get<number>('DEEPSEEK_MAX_TOKENS', 4096);
    this.temperature = this.config.get<number>('DEEPSEEK_TEMPERATURE', 0);

    console.log(
      `[DeepseekLLM] phase=initialized model=${this.model} ` +
      `baseURL=${this.config.get('DEEPSEEK_BASE_URL')} ` +
      `maxTokens=${this.maxTokens} temperature=${this.temperature}`,
    );
  }

  /**
   * Single chat completion call to Deepseek v4.
   * Returns the raw response text. No retry logic here — use chatCompletionWithRetry.
   */
  async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requireJson?: boolean;
    },
  ): Promise<string> {
    const startMs = Date.now();

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options?.temperature ?? this.temperature,
      max_tokens: options?.maxTokens ?? this.maxTokens,
      response_format: options?.requireJson
        ? { type: 'json_object' }
        : undefined,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    console.log(
      `[DeepseekLLM] phase=call_complete ` +
      `callType=${options?.requireJson ? 'json' : 'text'} ` +
      `durationMs=${Date.now() - startMs} tokensUsed=${tokensUsed}`,
    );

    return content;
  }

  /**
   * Chat completion with automatic retry and exponential backoff.
   * Retries on network errors and 5xx status codes.
   * Does NOT retry on 4xx errors (invalid requests).
   */
  async chatCompletionWithRetry(
    systemPrompt: string,
    userPrompt: string,
    options?: {
      temperature?: number;
      maxTokens?: number;
      requireJson?: boolean;
      maxRetries?: number;
    },
  ): Promise<string> {
    const maxRetries = options?.maxRetries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 45000);
          console.log(
            `[DeepseekLLM] phase=retry ` +
            `callType=${options?.requireJson ? 'json' : 'text'} ` +
            `attempt=${attempt}/${maxRetries} delayMs=${delay}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return await this.chatCompletion(systemPrompt, userPrompt, options);
      } catch (error) {
        const err = error as any;
        // Don't retry on 4xx client errors (invalid request, auth, etc.)
        if (err.status && err.status >= 400 && err.status < 500) {
          console.log(
            `[DeepseekLLM] phase=client_error ` +
            `status=${err.status} message=${err.message}`,
          );
          throw error;
        }
        lastError = err as Error;
        if (attempt === maxRetries) break;
      }
    }

    throw lastError || new Error('LLM call failed after retries');
  }
}
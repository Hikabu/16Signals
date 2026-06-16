/**
 * GeminiClient — Google Gemini LLM provider implementing LlmClient.
 *
 * Uses @google/genai SDK (same as the legacy JobDescriptionParserService
 * and InterviewQuestionService). Implements the LlmClient interface so
 * providers can be swapped by changing a single module binding.
 *
 * Environment variables:
 *   GOOGLE_AI_API_KEY  — Google AI API key (required)
 *   LLM_MODEL          — Model name (default: gemini-2.5-flash)
 *   LLM_MAX_TOKENS     — Max output tokens (default: 4096)
 *   LLM_TEMPERATURE    — Temperature 0-1 (default: 0)
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5 (refactored for Gemini)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LlmClient, LlmOptions } from './llm-client.interface';

@Injectable()
export class GeminiClient implements LlmClient {
  private readonly logger = new Logger(GeminiClient.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.getOrThrow<string>('GOOGLE_AI_API_KEY');

    this.ai = new GoogleGenAI({ apiKey });
    this.model = this.config.get<string>('LLM_MODEL', 'gemini-2.5-flash');
    this.maxTokens = this.config.get<number>('LLM_MAX_TOKENS', 4096);
    this.temperature = this.config.get<number>('LLM_TEMPERATURE', 0);

    this.logger.log(
      `[GeminiLLM] phase=initialized model=${this.model} ` +
        `maxTokens=${this.maxTokens} temperature=${this.temperature}`,
    );
  }

  /**
   * Single chat completion call to Gemini.
   * Returns the raw response text. No retry logic here — use chatCompletionWithRetry.
   */
  async chatCompletion(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<string> {
    const startMs = Date.now();

    // Gemini doesn't have a native system prompt role in all models.
    // We prepend the system prompt to the user content as a standard pattern.
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const temp = options?.temperature ?? this.temperature;
    const maxOut = options?.maxTokens ?? this.maxTokens;

    const result = await this.ai.models.generateContent({
      model: this.model,
      contents: fullPrompt,
      config: {
        temperature: temp,
        maxOutputTokens: maxOut,
      },
    });

    const content = result.text ?? '';
    const durationMs = Date.now() - startMs;

    this.logger.log(
      `[GeminiLLM] phase=call_complete ` +
        `callType=${options?.requireJson ? 'json' : 'text'} ` +
        `durationMs=${durationMs} responseLength=${content.length}`,
    );

    return content;
  }

  /**
   * Chat completion with automatic retry and exponential backoff.
   * Retries on network errors and 5xx status codes.
   * Does NOT retry on 4xx errors (invalid requests, auth failures).
   */
  async chatCompletionWithRetry(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmOptions,
  ): Promise<string> {
    const maxRetries = options?.maxRetries ?? 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 45000);
          this.logger.warn(
            `[GeminiLLM] phase=retry ` +
              `callType=${options?.requireJson ? 'json' : 'text'} ` +
              `attempt=${attempt}/${maxRetries} delayMs=${delay}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return await this.chatCompletion(systemPrompt, userPrompt, options);
      } catch (error) {
        const err = error;

        // Don't retry on 4xx client errors (invalid request, auth, etc.)
        if (err.status && err.status >= 400 && err.status < 500) {
          this.logger.error(
            `[GeminiLLM] phase=client_error ` +
              `status=${err.status} message=${err.message}`,
          );
          throw error;
        }

        // Don't retry on safety filter blocks
        if (
          err.message?.includes('SAFETY') ||
          err.message?.includes('RECITATION')
        ) {
          this.logger.error(
            `[GeminiLLM] phase=safety_block ` + `message=${err.message}`,
          );
          throw error;
        }

        lastError = err as Error;
        if (attempt === maxRetries) break;
      }
    }

    throw lastError || new Error('Gemini LLM call failed after retries');
  }
}

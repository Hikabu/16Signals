// PHASE 5.1 — implement per v5_rewrite_plan.md
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LLMPromptRequest {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  responseJsonSchema?: Record<string, any>;
}

export interface LLMAnalysisResult {
  text: string;
  json?: Record<string, any>;
}

@Injectable()
export class LlmClientService {
  constructor(
    // TODO: inject ConfigService
    private readonly configService: ConfigService,
  ) {}

  async analyze(req: LLMPromptRequest): Promise<LLMAnalysisResult> {
    throw new Error('not implemented');
  }
}

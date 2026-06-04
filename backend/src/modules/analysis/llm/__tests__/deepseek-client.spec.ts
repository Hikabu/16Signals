/**
 * Stage 5 — GeminiClient Unit Tests
 *
 * Tests the Gemini LLM client using the @google/genai SDK.
 * Verifies initialization, chatCompletion, retry logic, and error handling.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from '../gemini-client';

// Mock @google/genai
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn().mockResolvedValue({
        text: '{"result": "ok"}',
      }),
    },
  })),
}));

describe('Stage 5 — GeminiClient', () => {
  let client: GeminiClient;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockGenerateContent: jest.Mock;

  beforeEach(async () => {
    mockGenerateContent = jest.fn().mockResolvedValue({
      text: '{"result": "ok"}',
    });

    const { GoogleGenAI } = require('@google/genai');
    GoogleGenAI.mockImplementation(() => ({
      models: {
        generateContent: mockGenerateContent,
      },
    }));

    mockConfigService = {
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'GOOGLE_AI_API_KEY') return 'test-api-key';
        throw new Error(`Missing config: ${key}`);
      }),
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeminiClient,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    client = module.get<GeminiClient>(GeminiClient);
  });

  it('should initialize with GOOGLE_AI_API_KEY', () => {
    expect(client).toBeDefined();
    expect(mockConfigService.getOrThrow).toHaveBeenCalledWith('GOOGLE_AI_API_KEY');
  });

  it('should make a chat completion call', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: 'Hello from Gemini',
    });

    const result = await client.chatCompletion(
      'You are a helpful assistant.',
      'Say hello.',
    );

    expect(result).toBe('Hello from Gemini');
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('should retry on transient errors', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ text: 'Success after retry' });

    const result = await client.chatCompletionWithRetry(
      'System prompt',
      'User prompt',
      { maxRetries: 2 },
    );

    expect(result).toBe('Success after retry');
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it('should throw on 4xx client errors without retrying', async () => {
    const err = new Error('Invalid API key') as any;
    err.status = 401;

    mockGenerateContent.mockRejectedValueOnce(err);

    await expect(
      client.chatCompletionWithRetry('System', 'User', { maxRetries: 2 }),
    ).rejects.toThrow('Invalid API key');

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('should handle empty response gracefully', async () => {
    mockGenerateContent.mockResolvedValueOnce({ text: null });

    const result = await client.chatCompletion('System', 'User');

    expect(result).toBe('');
  });
});
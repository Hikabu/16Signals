/**
 * Stage 5 — DeepseekClient Unit Tests
 *
 * Tests the Deepseek v4 HTTP client with mocked OpenAI SDK.
 * Focuses on: initialization, chat completion, retry logic, JSON mode.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 5 test targets
 */

jest.mock('openai', () => {
  const mockCreate = jest.fn();
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeepseekClient } from '../deepseek-client';

describe('Stage 5 — DeepseekClient', () => {
  let client: DeepseekClient;
  let mockOpenAICreate: jest.Mock;

  function makeConfigService(overrides: Record<string, any> = {}) {
    return {
      getOrThrow: jest.fn((key: string) => {
        const defaults: Record<string, any> = {
          DEEPSEEK_API_KEY: 'test-key',
          DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
          DEEPSEEK_MODEL: 'deepseek-chat',
          DEEPSEEK_MAX_TOKENS: 4096,
          DEEPSEEK_TEMPERATURE: 0,
          DEEPSEEK_TIMEOUT_MS: 35000,
        };
        return overrides[key] ?? defaults[key];
      }),
      get: jest.fn((key: string, defaultValue?: any) => {
        const defaults: Record<string, any> = {
          DEEPSEEK_TIMEOUT_MS: 35000,
          DEEPSEEK_MAX_TOKENS: 4096,
          DEEPSEEK_TEMPERATURE: 0,
        };
        return overrides[key] ?? defaults[key] ?? defaultValue;
      }),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepseekClient,
        { provide: ConfigService, useValue: makeConfigService() },
      ],
    }).compile();

    client = module.get<DeepseekClient>(DeepseekClient);
    const mockOpenAI = jest.requireMock('openai').default;
    mockOpenAICreate = mockOpenAI().chat.completions.create;
  });

  it('should initialize with correct model and base URL', () => {
    const OpenAI = jest.requireMock('openai').default;
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-key',
        baseURL: 'https://api.deepseek.com/v1',
        timeout: 35000,
        maxRetries: 2,
      }),
    );
  });

  it('should make a chat completion call and return response text', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Test response' } }],
      usage: { total_tokens: 42 },
    });

    const result = await client.chatCompletion(
      'You are a helpful assistant.',
      'Hello!',
    );

    expect(result).toBe('Test response');
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
        ],
      }),
    );
  });

  it('should handle JSON response format option', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: '{"result":"ok"}' } }],
      usage: { total_tokens: 10 },
    });

    const result = await client.chatCompletion(
      'System prompt',
      'User prompt',
      { requireJson: true },
    );

    expect(result).toBe('{"result":"ok"}');
    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' },
      }),
    );
  });

  it('should retry on network failure and succeed', async () => {
    // Mock setTimeout to call immediately so retry tests are fast
    const origSetTimeout = global.setTimeout;
    global.setTimeout = ((fn: () => void, _ms?: number) => {
      origSetTimeout(fn, 0);
      return undefined as any;
    }) as typeof global.setTimeout;

    mockOpenAICreate
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'Retry success' } }],
        usage: { total_tokens: 10 },
      });

    const result = await client.chatCompletionWithRetry('System', 'User', { maxRetries: 1 });
    expect(result).toBe('Retry success');
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2);

    global.setTimeout = origSetTimeout;
  });

  it('should NOT retry on 4xx client errors', async () => {
    const clientError = new Error('Bad request') as any;
    clientError.status = 400;

    mockOpenAICreate.mockRejectedValueOnce(clientError);

    await expect(
      client.chatCompletionWithRetry('System', 'User'),
    ).rejects.toThrow('Bad request');

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
  });

  it('should support custom temperature and maxTokens per call', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'Custom response' } }],
      usage: { total_tokens: 15 },
    });

    await client.chatCompletion('System', 'User', {
      temperature: 0.7,
      maxTokens: 100,
    });

    expect(mockOpenAICreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        max_tokens: 100,
      }),
    );
  });

  it('should return empty string when LLM returns null content', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
      usage: { total_tokens: 0 },
    });

    const result = await client.chatCompletion('System', 'User');
    expect(result).toBe('');
  });
});
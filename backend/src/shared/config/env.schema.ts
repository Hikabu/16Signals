import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string(),

  NODE_ENV: z.string(),
  PORT: z.coerce.number(),
  SERVER_URL: z.string(),
  FRONTEND_URL: z.string(),
  REDIS_URL: z.string(),

  GITHUB_AUTH_ENABLED: z.string().optional(),
  GITHUB_AUTH_CLIENT_ID: z.string().optional(),
  GITHUB_AUTH_CLIENT_SECRET: z.string().optional(),
  GITHUB_AUTH_ENCRYPTION_KEY: z.string().optional(),

  GITHUB_ANALYSIS_NAME: z.string().optional(),
  GITHUB_ANALYSIS_APP_ID: z.coerce.number().optional(),
  GITHUB_ANALYSIS_PRIVATE_KEY: z.string().optional(),
  GITHUB_ANALYSIS_WEBHOOK_SECRET: z.string().optional(),

  GITHUB_SYSTEM_TOKEN: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),

  JWT_SECRET: z.string(),
  JWT_ACCESS_SECRET: z.string(),
  JWT_REFRESH_SECRET: z.string(),

  INTERNAL_SERVICE_KEY: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),

  GOOGLE_AI_API_KEY: z.string().optional(),

  RECLAIM_APP_ID: z.string().optional(),
  RECLAIM_APP_SECRET: z.string().optional(),

});

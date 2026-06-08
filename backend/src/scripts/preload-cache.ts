import { NestFactory } from '@nestjs/core';
import { Octokit } from 'octokit';
import { AppModule } from '../app.module';
import { GithubAdapterService } from '../modules/scoring/github-adapter/github-adapter.service';
import { ScoringService } from '../modules/scoring/scoring-service/scoring.service';
import { CacheService } from '../modules/scoring/cache/cache.service';
import { Logger } from '@nestjs/common';

const SEED_DEVELOPERS = ['torvalds', 'gaearon', 'yyx990803', 'antirez', 'dhh'];

async function bootstrap() {
  const logger = new Logger('PreloadCache');

  // Disable logging from other modules to keep output clean
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const githubAdapter = app.get(GithubAdapterService);
  const scoringService = app.get(ScoringService);
  const cacheService = app.get(CacheService);

  const token = process.env.GITHUB_SYSTEM_TOKEN;
  if (!token) {
    logger.error('GITHUB_SYSTEM_TOKEN environment variable is required');
    await app.close();
    process.exit(1);
  }

  const octokit = new Octokit({
    auth: token,
    request: {
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  });

  logger.log(
    `Starting cache preload for ${SEED_DEVELOPERS.length} developers...`,
  );

  for (const username of SEED_DEVELOPERS) {
    try {
      logger.log(`Processing ${username}...`);

      // 1. Fetch
      const rawData = await githubAdapter.fetchRawData(octokit, username);

      // 2. Score
      const result = scoringService.score(rawData);

      // 3. Cache
      const cacheKey = cacheService.buildCacheKey(username);
      await cacheService.set(cacheKey, result);

      logger.log(`Successfully preloaded cache for ${username}`);
    } catch (error) {
      logger.error(`Failed to preload ${username}: ${error.message}`);
    }
  }

  logger.log('Preload complete.');
  await app.close();
}

bootstrap();

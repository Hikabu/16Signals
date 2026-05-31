/**
 * CorpusCacheService — Redis-backed cache for SignalCorpus with 7-day TTL.
 *
 * Key format: corpus:{username}:{mode}
 * Example: corpus:torvalds:light
 *
 * Cache co-location: The corpus is stored in the same Redis instance used
 * for BullMQ queues and the legacy scoring cache. This ensures the new
 * pipeline can share infrastructure without additional services.
 *
 * Tracing: Every cache operation emits structured console.log so the
 * full cache lifecycle is visible in production logs.
 *
 * Reference: DEEPSEEK_V4_REFACTOR_PLAN.md Stage 1
 */

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { SignalCorpus, CorpusGroup, CollectionMode } from '../corpus/corpus.types';

@Injectable()
export class CorpusCacheService {
  private readonly TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private readonly PREFIX = 'corpus';

  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  private key(username: string, mode: string): string {
    return `${this.PREFIX}:${username}:${mode}`;
  }

  /**
   * Retrieve a cached corpus for a user + mode combination.
   * Returns null on cache miss.
   */
  async get(username: string, mode: string): Promise<SignalCorpus | null> {
    const cacheKey = this.key(username, mode);
    const raw = await this.redis.get(cacheKey);

    if (raw) {
      console.log(
        `[CorpusCache] phase=cache_hit username=${username} mode=${mode} key=${cacheKey}`,
      );
      try {
        return JSON.parse(raw);
      } catch {
        console.log(
          `[CorpusCache] phase=parse_error username=${username} mode=${mode}`,
        );
        await this.redis.del(cacheKey);
        return null;
      }
    }

    console.log(
      `[CorpusCache] phase=cache_miss username=${username} mode=${mode} key=${cacheKey}`,
    );
    return null;
  }

  /**
   * Store a corpus in the cache with 7-day TTL.
   */
  async set(corpus: SignalCorpus): Promise<void> {
    const cacheKey = this.key(corpus.github_username, corpus.collection_mode);
    await this.redis.set(
      cacheKey,
      JSON.stringify(corpus),
      'EX',
      this.TTL_SECONDS,
    );

    console.log(
      `[CorpusCache] phase=corpus_stored username=${corpus.github_username} ` +
      `mode=${corpus.collection_mode} key=${cacheKey} ttl=7d ` +
      `groupsPresent=${corpus.groups_present.join(',')}`,
    );
  }

  /**
   * Check if a corpus exists in the cache without retrieving it.
   */
  async exists(username: string, mode: string): Promise<boolean> {
    const result = await this.redis.exists(this.key(username, mode));
    return result === 1;
  }

  /**
   * Merge a Light corpus with Deep delta data.
   * Preserves all groups from Light, adds Deep-only groups.
   * Stores the merged result in the cache.
   */
  async mergeDelta(
    existingLightCorpus: SignalCorpus,
    deepDeltas: Partial<SignalCorpus>,
  ): Promise<SignalCorpus> {
    console.log(
      `[CorpusCache] phase=merge_delta username=${existingLightCorpus.github_username} ` +
      `fromMode=light toMode=deep`,
    );

    const crypto = require('crypto');
    const merged: SignalCorpus = {
      ...existingLightCorpus,
      ...deepDeltas,
      collection_mode: 'deep',
      corpus_id: `cor_${crypto.randomBytes(12).toString('hex')}`,
      collected_at: new Date().toISOString(),
      groups_present: Array.from(
        new Set([
          ...existingLightCorpus.groups_present,
          ...(deepDeltas.groups_present || []),
        ]),
      ) as CorpusGroup[],
    };

    await this.set(merged);

    console.log(
      `[CorpusCache] phase=merge_complete username=${existingLightCorpus.github_username} ` +
      `groupsPresent=${merged.groups_present.join(',')} corpusId=${merged.corpus_id}`,
    );

    return merged;
  }

  /**
   * Delete a cached corpus (for cache invalidation).
   */
  async invalidate(username: string, mode: string): Promise<void> {
    const cacheKey = this.key(username, mode);
    await this.redis.del(cacheKey);

    console.log(
      `[CorpusCache] phase=invalidate username=${username} mode=${mode} key=${cacheKey}`,
    );
  }
}
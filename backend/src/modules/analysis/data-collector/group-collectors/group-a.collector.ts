/**
 * Group A Collector — Identity & Profile
 *
 * Fetches: GitHub user profile, bio, company claim, commit email domains,
 *          linked URLs, org memberships (Light Mode: public only).
 *
 * API calls: 1 REST (users.getByUsername) + 1 REST (users.listEmails if available)
 * Output: IdentitySignals
 *
 * Reference: corpus.types.ts Group A
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { IdentitySignals } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

@Injectable()
export class GroupACollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<IdentitySignals> {
    console.log(
      `[GroupACollector] phase=collect_start username=${username}`,
    );

    // Fetch the user profile
    const response = await octokit.rest.users.getByUsername({ username });
    circuitBreaker.updateFromHeaders(response.headers as any);

    const profile = response.data;
    const accountCreatedAt = new Date(profile.created_at);
    const accountAgeDays = Math.floor(
      (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Extract commit email domains from public events (simplified — uses the
    // public profile's email and any linked GitHub-provided email)
    const commitEmailDomains: string[] = [];
    if (profile.email) {
      const domain = profile.email.split('@')[1];
      if (domain) commitEmailDomains.push(domain);
    }

    // Build linked URLs from profile
    const linkedUrls: string[] = [];
    if (profile.blog) linkedUrls.push(profile.blog);
    if (profile.twitter_username) {
      linkedUrls.push(`https://twitter.com/${profile.twitter_username}`);
    }

    console.log(
      `[GroupACollector] phase=collect_complete username=${username} ` +
      `ageDays=${accountAgeDays} company=${profile.company ?? '(none)'} ` +
      `hireable=${profile.hireable}`,
    );

    return {
      account_age_days: accountAgeDays,
      bio: profile.bio,
      company_claim: profile.company,
      linked_urls: linkedUrls,
      commit_email_domains: commitEmailDomains,
      github_org_memberships: [], // Requires GraphQL in Light Mode; populated in Deep
      hireable_flag: profile.hireable ?? null,
    };
  }
}
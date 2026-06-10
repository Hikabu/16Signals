/**
 * Group A Collector — Identity & Profile
 *
 * Fetches: GitHub user profile, bio, company claim, commit email domains,
 *          linked URLs, org memberships.
 *
 * API calls:
 *   - 1 REST (users.getByUsername) — always
 *   - 1 REST (orgs.listForUser)    — always (public orgs, no auth required)
 *   - 1 REST (users.listEmails)    — if OAuth token has user:email scope (not always available)
 *
 * Output: IdentitySignals
 *
 * Reference: corpus.types.ts Group A
 */

import { Injectable } from '@nestjs/common';
import { Octokit } from 'octokit';
import { IdentitySignals } from '../../corpus/corpus.types';
import { CircuitBreakerService } from '../circuit-breaker.service';

/** Maximum bio length before truncation to prevent abuse payloads in downstream LLM contexts. */
const MAX_BIO_LENGTH = 5000;

@Injectable()
export class GroupACollector {
  async collect(
    octokit: Octokit,
    username: string,
    circuitBreaker: CircuitBreakerService,
  ): Promise<IdentitySignals> {
    console.log(
      `	[A_GroupCollector] phase=collect_start username=${username}`,
    );

    // ── Fetch the user profile ──────────────────────────────────────────
    const response = await octokit.rest.users.getByUsername({ username });
    circuitBreaker.updateFromHeaders(response.headers as any);

    const profile = response.data;

    // ── account_age_days ────────────────────────────────────────────────
    // created_at is always present on GitHub user objects. Defensive parsing
    // prevents a single malformed field from crashing the entire Group A collection.
    let accountAgeDays = 0;
    try {
      const accountCreatedAt = new Date(profile.created_at);
      if (!isNaN(accountCreatedAt.getTime())) {
        accountAgeDays = Math.floor(
          (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24),
        );
      }
    } catch {
      // Keep 0 — created_at parsing failed (should never happen with valid
      // GitHub API responses, but defensive fallback ensures collection continues).
    }

    // ── bio ─────────────────────────────────────────────────────────────
    let bio: string | null = profile.bio ?? null;
    // Truncate to prevent abuse payloads from reaching downstream LLM contexts.
    if (bio !== null && bio.length > MAX_BIO_LENGTH) {
      bio = bio.slice(0, MAX_BIO_LENGTH);
    }

    // ── company_claim ───────────────────────────────────────────────────
    const companyClaim: string | null = profile.company ?? null;

    // ── linked_urls ─────────────────────────────────────────────────────
    const linkedUrls: string[] = [];

    // 1. Canonical GitHub profile URL (always present, zero cost)
    if (profile.html_url && profile.html_url.trim()) {
      linkedUrls.push(profile.html_url.trim());
    }

    // 2. Blog / website URL (with validation — field is free-text)
    if (profile.blog && profile.blog.trim()) {
      const blogValue = profile.blog.trim();
      try {
        new URL(blogValue); // throws if invalid URL format
        linkedUrls.push(blogValue);
      } catch {
        // Skip invalid URLs silently — the field may contain non-URL text.
      }
    }

    // 3. Derived Twitter / X URL
    if (profile.twitter_username && profile.twitter_username.trim()) {
      linkedUrls.push(
        `https://twitter.com/${profile.twitter_username.trim()}`,
      );
    }

    // ── commit_email_domains ────────────────────────────────────────────
    // NOTE: GitHub does not expose a single endpoint for "all commit email domains."
    // This collector uses the best available REST sources:
    //   1. profile.email (public profile email, only populated if user opts in)
    //   2. Public emails via users.listEmailsForAuthenticatedUser (requires user:email scope)
    //
    // For exhaustive commit email domains, a GraphQL commit-sampling query across
    // the user's top repos (Commit.author.email) or Deep Mode git-log analysis
    // is needed. This is a sampled/best-effort signal, not exhaustive.
    const commitEmailDomains: string[] = [];

    // Source 1: Public profile email
    if (profile.email && profile.email.trim()) {
      const domain = extractEmailDomain(profile.email);
      if (domain) commitEmailDomains.push(domain);
    }

    // Source 2: Verified public emails (requires user:email OAuth scope;
    // silently fails if token lacks the scope or for unauthenticated requests).
    try {
      const emailsResponse =
        await octokit.rest.users.listEmailsForAuthenticatedUser({
          per_page: 100,
        });
      circuitBreaker.updateFromHeaders(emailsResponse.headers as any);

      for (const emailObj of emailsResponse.data) {
        if (emailObj.email && emailObj.verified) {
          const domain = extractEmailDomain(emailObj.email);
          if (domain && !commitEmailDomains.includes(domain)) {
            commitEmailDomains.push(domain);
          }
        }
      }
    } catch {
      // Token lacks user:email scope, or user is not the authenticated user.
      // This is expected in most public-analysis scenarios. Continue silently.
    }

    // ── github_org_memberships ──────────────────────────────────────────
    // Light Mode: public organization memberships via
    //   GET /users/{username}/orgs (no authentication required).
    // Deep Mode: can additionally call GET /user/orgs for private memberships
    //   if the OAuth token has read:org scope.
    let orgMemberships: string[] = [];

    try {
      // Fetch public orgs — available for any user with no auth.
      const orgsResponse = await octokit.rest.orgs.listForUser({
        username,
        per_page: 100,
      });
      circuitBreaker.updateFromHeaders(orgsResponse.headers as any);

      orgMemberships = orgsResponse.data.map((org: any) => org.login);

      // TODO: Handle pagination for users in >100 orgs (extremely rare).
      // The Link header should be checked for 'rel="next"' if
      // orgsResponse.data.length === 100.
    } catch (error) {
      console.log(
        `  [A_GroupCollector] phase=orgs_error username=${username} ` +
        `error=${(error as Error).message}`,
      );
      // Keep orgMemberships as [] on failure — org membership is a
      // supplementary signal; failure should not block the collection.
    }

    // ── hireable_flag ───────────────────────────────────────────────────
    // ?? null preserves the tri-state: true, false, or null (not set).
    const hireableFlag: boolean | null = profile.hireable ?? null;

    console.log(
      `	[A_GroupCollector] phase=collect_complete username=${username} ` +
      `ageDays=${accountAgeDays} company=${profile.company ?? '(none)'} ` +
      `hireable=${profile.hireable} orgs=${orgMemberships.length} ` +
      `emailDomains=${commitEmailDomains.length} urls=${linkedUrls.length}`,
    );

    return {
      account_age_days: accountAgeDays,
      bio,
      company_claim: companyClaim,
      linked_urls: linkedUrls,
      commit_email_domains: commitEmailDomains,
      github_org_memberships: orgMemberships,
      hireable_flag: hireableFlag,
    };
  }
}

/**
 * Extract the domain portion from an email address string.
 * Returns null if the input is not a valid email format with a domain.
 *
 * Examples:
 *   "user@example.com" → "example.com"
 *   "user@sub.example.co.uk" → "sub.example.co.uk"
 *   "invalid" → null
 *   "" → null
 */
function extractEmailDomain(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const atIdx = trimmed.lastIndexOf('@');
  if (atIdx === -1 || atIdx === 0 || atIdx === trimmed.length - 1) {
    return null;
  }

  return trimmed.slice(atIdx + 1).toLowerCase();
}
/**
 * GitHub Credential Provider Interface
 *
 * Defines the pluggable provider contract for resolving GitHub authentication
 * credentials. Any analysis mode can request credentials via context, and the
 * orchestrator selects the appropriate provider(s) based on availability.
 *
 * Architecture:
 *   - Each provider knows its credential source (OAuth PAT, System PAT, App install)
 *   - canProvide() determines if the provider is applicable to a given context
 *   - createOctokit() returns a public-API Octokit
 *   - createInstallationOctokit() returns an App-installation-scoped Octokit
 *   - getRawToken() returns a raw token string for git clone / direct HTTP
 *
 * Future extensibility:
 *   - Add providers for different GitHub Apps (limited-scope, read-only, etc.)
 *   - Add providers for different auth mechanisms (fine-grained PATs, etc.)
 */

import { Octokit } from 'octokit';

/**
 * Context passed to credential providers. Describes who is requesting access,
 * for what mode, and which GitHub resources are targeted.
 */
export interface GitHubCredentialContext {
  /** Analysis mode requesting credentials */
  mode: 'light' | 'deep' | 'cv-verify';

  /** Target GitHub username to analyze */
  githubUsername: string;

  /** Authenticated user ID (null for anonymous/unauthenticated requests) */
  userId?: string | null;

  /** GitHub App installation ID for installation-scoped access */
  installationId?: number;

  /** Optional metadata for provider selection (future: app scope, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Resolved credential pair returned to callers.
 * Every analysis mode gets a primary Octokit for public API calls.
 * Deep Mode additionally gets an installation Octokit + raw token for private repo access.
 */
export interface OctokitPair {
  /** Primary Octokit for public GitHub API calls */
  primary: Octokit;

  /** Installation-scoped Octokit for private repo access (Deep Mode only) */
  installation?: Octokit;

  /** Raw token string for git clone operations (Deep Mode only) */
  rawToken?: string;

  /** Human-readable description of credential sources for logging */
  sourceDescription: string;
}

/**
 * Pluggable credential provider interface.
 *
 * Each implementation knows how to create Octokit instances from its credential
 * source. Providers are registered in order and the orchestrator tries them in
 * sequence.
 */
export interface IGitHubCredentialProvider {
  /** Unique provider name for logging/debugging */
  readonly name: string;

  /**
   * Can this provider handle the given context?
   * Providers check their own prerequisites (config present, IDs valid, etc.)
   */
  canProvide(context: GitHubCredentialContext): boolean;

  /**
   * Create an Octokit for public API calls.
   * Always called for light/cv-verify modes, and for the primary Octokit in deep mode.
   */
  createOctokit(context: GitHubCredentialContext): Promise<Octokit>;

  /**
   * Optionally create an installation-scoped Octokit.
   * Only implemented by GitHub App-based providers.
   * Used for private repo access in Deep Mode.
   */
  createInstallationOctokit?(context: GitHubCredentialContext): Promise<Octokit>;

  /**
   * Optionally get a raw token string for direct use (git clone, curl, etc.).
   * Only implemented by providers that can export raw tokens.
   * Returns null if not supported.
   */
  getRawToken?(context: GitHubCredentialContext): Promise<string | null>;
}
/**
 * Octokit client factory with throttling + retry + pagination.
 *
 * One client per token. Caching of responses is handled at the service layer
 * (Redis/SQLite) — the client itself only adds rate-limit awareness.
 */

import { Octokit } from "octokit"
import { getPaths } from "../../config/paths"
import { loadUserConfig } from "../../config/settings"
import { resolveGitHubToken, type TokenResolution } from "./auth"

export interface GitHubClientOptions {
  token?: string
  env?: NodeJS.ProcessEnv
  baseUrl?: string
}

export interface GitHubClient {
  octokit: Octokit
  tokenSource: TokenResolution["source"]
  /** True when no token is available — read-only public endpoints only. */
  anonymous: boolean
}

export async function createGitHubClient(options: GitHubClientOptions = {}): Promise<GitHubClient> {
  const paths = getPaths()
  const config = loadUserConfig(paths)
  const resolution = await resolveGitHubToken(
    options.token,
    config.githubTokenEnvVar,
    options.env ?? process.env,
  )

  const octokit = new Octokit({
    auth: resolution.token ?? undefined,
    baseUrl: options.baseUrl,
    throttle: {
      onRateLimit: (_retryAfter: number, options: { method: string; url: string }) => {
        // Retry once after the rate-limit window.
        if (options.method === "GET") return true
        return false
      },
      onSecondaryRateLimit: () => false,
    },
  })

  return {
    octokit,
    tokenSource: resolution.source,
    anonymous: resolution.token === null,
  }
}

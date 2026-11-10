/**
 * Detect the GitHub repository that owns the current working directory.
 *
 * "explain this repository" / "find issues in this repository" have to mean
 * something concrete. When the TUI has no repository selected we resolve the
 * request against `origin` of the terminal's working directory, so the answer
 * is about the code the developer actually has open.
 */

import { type GitHubRef, parseGitHubRef } from "../integrations/github/ref"
import { git } from "./manager"

/** Extract an owner/repo reference from any of the common remote URL shapes. */
export function refFromRemoteUrl(url: string): GitHubRef | null {
  const trimmed = url.trim()
  if (trimmed.length === 0) return null

  const isGitHubHost = (host: string): boolean =>
    /^(www\.)?github\.com$/i.test(host.replace(/:\d+$/, ""))

  // scheme://[user@]host[:port]/owner/repo[.git]
  let path: string | null = null
  const withScheme = trimmed.match(/^([a-z+]+):\/\/(?:[^/@]+@)?([^/]+)(?:\/(.*))?$/i)
  if (withScheme?.[2]) {
    if (!isGitHubHost(withScheme[2])) return null
    path = withScheme[3] ?? null
  } else {
    // scp-like: [user@]host:owner/repo[.git]  (no scheme)
    const scpLike = trimmed.match(/^(?:[^@/]+@)?([^:/]+):(.*)$/)
    if (scpLike?.[1] && scpLike[2]) {
      if (!isGitHubHost(scpLike[1])) return null
      path = scpLike[2]
    } else {
      return null
    }
  }

  if (!path) return null
  const cleaned = path.replace(/^\/+/, "").replace(/\.git$/i, "")
  // A remote that is not exactly owner/repo is not mapped — never a guess.
  return parseGitHubRef(cleaned)
}

/**
 * Read `origin` for `cwd`. Returns null when the directory is not a git
 * repository, has no origin, or the origin is not a GitHub repository —
 * never a guess.
 */
export async function detectLocalRepository(cwd: string): Promise<GitHubRef | null> {
  try {
    const inside = await git(["rev-parse", "--is-inside-work-tree"], cwd)
    if (inside.exitCode !== 0 || inside.stdout.trim() !== "true") return null

    const remote = await git(["remote", "get-url", "origin"], cwd)
    if (remote.exitCode !== 0) return null

    return refFromRemoteUrl(remote.stdout)
  } catch {
    return null
  }
}

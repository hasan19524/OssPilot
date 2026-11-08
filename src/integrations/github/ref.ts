/**
 * Parse a GitHub reference like "owner/repository#123" or "owner/repository".
 */

export interface GitHubRef {
  owner: string
  repo: string
  issueNumber?: number
}

export function parseGitHubRef(ref: string): GitHubRef | null {
  const match = ref.trim().match(/^([^/\s]+)\/([^#\s]+)(?:#(\d+))?$/)
  if (!match) return null
  const owner = match[1]
  const repo = match[2]
  if (!owner || !repo) return null
  const result: GitHubRef = { owner, repo }
  if (match[3]) result.issueNumber = Number(match[3])
  return result
}

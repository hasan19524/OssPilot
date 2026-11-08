/**
 * Parse a GitHub reference like "owner/repository#123" or "owner/repository".
 *
 * Security: Strict validation to prevent flag injection, path traversal,
 * and other injection attacks via crafted references.
 */

export interface GitHubRef {
  owner: string
  repo: string
  issueNumber?: number
}

const OWNER_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
const REPO_REGEX = /^[a-zA-Z0-9._-]+$/

export function parseGitHubRef(ref: string): GitHubRef | null {
  const trimmed = ref.trim()
  const match = trimmed.match(/^([^/\s]+)\/([^#\s]+)(?:#(\d+))?$/)
  if (!match) return null

  const owner = match[1]
  const repo = match[2]
  const issueStr = match[3]

  if (!owner || !repo) return null

  // Strict validation to prevent flag injection and path traversal
  if (!OWNER_REGEX.test(owner)) return null
  if (!REPO_REGEX.test(repo)) return null
  if (owner.length > 39) return null // GitHub max username length
  if (repo.length > 100) return null // GitHub max repo name length

  const result: GitHubRef = { owner, repo }
  if (issueStr) {
    if (!/^\d+$/.test(issueStr)) return null
    const num = Number(issueStr)
    if (!Number.isInteger(num) || num <= 0 || num > 2147483647) return null
    result.issueNumber = num
  }
  return result
}

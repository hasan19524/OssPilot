/**
 * Pre-flight checks before starting a contribution.
 * Based on real open-source contribution lessons:
 * - Search for existing PRs/issues before starting
 * - Check if issue is already fixed on default branch
 * - Check maintainer engagement
 * - Check if repo accepts external PRs
 */

import { createGitHubClient } from "./client"
import { listOpenIssues } from "./issues"
import { listPullRequests } from "./pull-requests"
import { getRepository } from "./repositories"

export interface PreflightResult {
  ok: boolean
  warnings: string[]
  blockers: string[]
}

export async function runPreflight(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<PreflightResult> {
  const client = await createGitHubClient()
  const warnings: string[] = []
  const blockers: string[] = []

  try {
    const repository = await getRepository(client, owner, repo)

    // Check if repo is archived
    // (GitHub API doesn't return archived in our schema, but we can check via raw)
    // Check maintainer engagement: open issues count vs stars
    if (repository.openIssues > 500) {
      warnings.push(
        `Repository has ${repository.openIssues} open issues — maintainer may be overwhelmed.`,
      )
    }

    // Check for existing PRs referencing this issue
    const prs = await listPullRequests(client, owner, repo, "all")
    const relatedPrs = prs.filter(
      (pr) =>
        pr.title.toLowerCase().includes(`#${issueNumber}`) ||
        (pr.body ?? "").includes(`#${issueNumber}`) ||
        (pr.body ?? "").toLowerCase().includes(`fixes #${issueNumber}`) ||
        (pr.body ?? "").toLowerCase().includes(`closes #${issueNumber}`),
    )
    if (relatedPrs.length > 0) {
      const openPrs = relatedPrs.filter((pr) => pr.state === "open")
      if (openPrs.length > 0) {
        blockers.push(
          `Found ${openPrs.length} open PR(s) already addressing issue #${issueNumber}. Search before starting.`,
        )
      } else {
        warnings.push(
          `Found ${relatedPrs.length} closed PR(s) related to issue #${issueNumber}. Check if already fixed.`,
        )
      }
    }

    // Check if issue is already closed
    const issues = await listOpenIssues(client, owner, repo, { perPage: 100 })
    const issue = issues.find((i) => i.number === issueNumber)
    if (!issue) {
      // Issue might be closed
      warnings.push(
        `Issue #${issueNumber} not found in open issues — it may be closed or already resolved.`,
      )
    } else if (issue.labels.some((l) => l.toLowerCase().includes("pending release"))) {
      warnings.push("Issue has 'pending release' label — may already be fixed on main.")
    }

    // Check for collaborator-only repos (zod-style)
    if (repository.description?.toLowerCase().includes("collaborator")) {
      warnings.push("Repository may restrict PRs to collaborators. Check CONTRIBUTING.md.")
    }
  } catch (error) {
    warnings.push(`Preflight check partially failed: ${String(error)}`)
  }

  return {
    ok: blockers.length === 0,
    warnings,
    blockers,
  }
}

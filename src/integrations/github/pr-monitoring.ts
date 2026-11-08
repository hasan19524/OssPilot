/**
 * PR monitoring via direct Octokit integration (no gh CLI dependency).
 *
 * Tracks PR status, reviews, review comments, and merge status.
 * Respects GitHub rate limits via Octokit throttle plugin.
 */

import type { GitHubClient } from "./client"

export interface PrStatus {
  number: number
  state: "open" | "closed"
  merged: boolean
  mergeable: boolean | null
  title: string
  url: string
  comments: PrComment[]
  reviews: PrReview[]
  checks: PrCheck[]
  lastUpdated: string
}

export interface PrComment {
  id: number
  author: string | null
  body: string
  createdAt: string
  isReviewComment: boolean
}

export interface PrReview {
  id: number
  author: string | null
  state: string
  body: string
  submittedAt: string
}

export interface PrCheck {
  name: string
  status: string
  conclusion: string | null
}

export async function getPrStatus(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PrStatus> {
  // Fetch PR details
  const prRes = await client.octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
  const pr = prRes.data

  // Fetch issue comments (conversation)
  const commentsRes = await client.octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 50,
  })

  // Fetch review comments (inline)
  const reviewCommentsRes = await client.octokit.rest.pulls.listReviewComments({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 50,
  })

  // Fetch reviews
  const reviewsRes = await client.octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 50,
  })

  // Fetch check runs (CI status)
  let checks: PrCheck[] = []
  try {
    const checksRes = await client.octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: pr.head.ref,
      per_page: 50,
    })
    checks = checksRes.data.check_runs.map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
    }))
  } catch {
    // Checks may not be available
  }

  const comments: PrComment[] = [
    ...commentsRes.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? null,
      body: c.body ?? "",
      createdAt: c.created_at,
      isReviewComment: false,
    })),
    ...reviewCommentsRes.data.map((c) => ({
      id: c.id,
      author: c.user?.login ?? null,
      body: c.body ?? "",
      createdAt: c.created_at,
      isReviewComment: true,
    })),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const reviews: PrReview[] = reviewsRes.data.map((r) => ({
    id: r.id,
    author: r.user?.login ?? null,
    state: r.state,
    body: r.body ?? "",
    submittedAt: r.submitted_at ?? "",
  }))

  // Determine merge status
  let merged = false
  if (pr.state === "closed") {
    merged = (pr as { merged?: boolean }).merged ?? false
  }

  return {
    number: pr.number,
    state: pr.state as "open" | "closed",
    merged,
    mergeable: pr.mergeable ?? null,
    title: pr.title,
    url: pr.html_url,
    comments,
    reviews,
    checks,
    lastUpdated: pr.updated_at,
  }
}

/** Create a pull request via direct Octokit (no gh CLI dependency). */
export async function createPullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: { title: string; body: string; head: string; base: string; draft?: boolean },
): Promise<{ ok: boolean; url: string; number: number | null; error?: string }> {
  try {
    const response = await client.octokit.rest.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft ?? false,
    })
    return {
      ok: true,
      url: response.data.html_url,
      number: response.data.number,
    }
  } catch (error) {
    const err = error as { message?: string; status?: number }
    return { ok: false, url: "", number: null, error: err.message ?? String(error) }
  }
}

/** Push a branch to origin. Requires explicit approval by caller. */
export async function pushBranchViaGit(
  worktreePath: string,
  branchName: string,
): Promise<{ ok: boolean; output: string }> {
  const { git } = await import("../../workspace/manager")
  const result = await git(["push", "-u", "origin", branchName], worktreePath)
  return { ok: result.exitCode === 0, output: result.stdout + result.stderr }
}

/** Check if a PR has new activity since a given timestamp. */
export function hasNewActivity(status: PrStatus, since: string): boolean {
  const sinceTime = new Date(since).getTime()
  return status.lastUpdated > new Date(sinceTime).toISOString()
}

/** Summarize PR status for display. */
export function summarizePrStatus(status: PrStatus): string {
  const parts: string[] = []
  parts.push(`#${status.number}: ${status.title}`)
  parts.push(`State: ${status.merged ? "MERGED" : status.state}`)
  if (status.mergeable === false) parts.push("Mergeable: NO (conflicts)")
  if (status.reviews.length > 0) {
    const approvals = status.reviews.filter((r) => r.state === "APPROVED").length
    const changesRequested = status.reviews.filter((r) => r.state === "CHANGES_REQUESTED").length
    parts.push(`Reviews: ${approvals} approved, ${changesRequested} changes requested`)
  }
  if (status.comments.length > 0) parts.push(`Comments: ${status.comments.length}`)
  const failedChecks = status.checks.filter((c) => c.conclusion === "failure")
  if (failedChecks.length > 0) parts.push(`CI: ${failedChecks.length} failed`)
  return parts.join("\n")
}

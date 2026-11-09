/**
 * Maintainer Feedback Intelligence.
 *
 * Retrieves new comments/reviews on a PR, identifies requested changes,
 * explains them, maps feedback to affected files, and produces a revision plan.
 *
 * NEVER posts automatically. Every revision requires explicit user approval.
 */

import type { GitHubClient } from "../integrations/github/client"
import {
  getPrStatus,
  type PrComment,
  type PrReview,
  type PrStatus,
} from "../integrations/github/pr-monitoring"

export type FeedbackSeverity = "blocking" | "non-blocking" | "approval" | "informational"

export interface FeedbackItem {
  id: string
  author: string | null
  source: "review" | "comment"
  state: string | null
  severity: FeedbackSeverity
  body: string
  createdAt: string
  inferredFiles: string[]
}

export interface FeedbackAnalysis {
  pr: PrStatus
  items: FeedbackItem[]
  requestedChanges: FeedbackItem[]
  approvals: FeedbackItem[]
  summary: string
  revisionRequired: boolean
}

const FILE_HINT =
  /([\w./-]+\.(?:ts|tsx|js|jsx|py|rs|go|rb|java|md|json|ya?ml|toml|css|scss|html))\b/g

function inferFiles(text: string): string[] {
  const matches = text.match(FILE_HINT)
  if (!matches) return []
  return Array.from(new Set(matches)).slice(0, 10)
}

export function classifyReview(review: PrReview): FeedbackItem {
  const body = review.body?.trim() ?? ""
  const plain = review.state === "CHANGES_REQUESTED"
  const approved = review.state === "APPROVED"
  const severity: FeedbackSeverity = plain ? "blocking" : approved ? "approval" : "informational"
  return {
    id: `review-${review.id}`,
    author: review.author,
    source: "review",
    state: review.state,
    severity,
    body,
    createdAt: review.submittedAt,
    inferredFiles: inferFiles(body),
  }
}

export function classifyComment(comment: PrComment): FeedbackItem {
  const body = comment.body?.trim() ?? ""
  const isBlocking =
    /\b(must|please (?:fix|change|update)|blocker|requested change|cannot merge|needs? (?:to be )?(?:fix|change|updat))\b/i.test(
      body,
    )
  return {
    id: `comment-${comment.id}`,
    author: comment.author,
    source: "comment",
    state: null,
    severity: isBlocking ? "blocking" : "non-blocking",
    body,
    createdAt: comment.createdAt,
    inferredFiles: inferFiles(body),
  }
}

export async function analyseFeedback(
  client: GitHubClient,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<FeedbackAnalysis> {
  const pr = await getPrStatus(client, owner, repo, prNumber)

  const items: FeedbackItem[] = [
    ...pr.reviews.map(classifyReview),
    ...pr.comments.map(classifyComment),
  ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const requestedChanges = items.filter(
    (i) => i.severity === "blocking" || i.state === "CHANGES_REQUESTED",
  )
  const approvals = items.filter((i) => i.severity === "approval")

  let summary: string
  if (pr.merged) summary = `PR #${prNumber} has been MERGED — no revision needed.`
  else if (pr.state === "closed") summary = `PR #${prNumber} was CLOSED without merging.`
  else if (requestedChanges.length > 0)
    summary = `${requestedChanges.length} blocking/review item(s) require attention on PR #${prNumber}.`
  else if (approvals.length > 0)
    summary = `PR #${prNumber} has ${approvals.length} approval(s) and no blocking feedback.`
  else summary = `PR #${prNumber} has no actionable maintainer feedback yet.`

  return {
    pr,
    items,
    requestedChanges,
    approvals,
    summary,
    revisionRequired: !pr.merged && pr.state === "open" && requestedChanges.length > 0,
  }
}

export function formatFeedbackAnalysis(analysis: FeedbackAnalysis): string {
  const lines: string[] = []
  lines.push(`\nMAINTAINER FEEDBACK — PR #${analysis.pr.number}: ${analysis.pr.title}`)
  lines.push(`  ${analysis.summary}`)
  lines.push(
    `  State: ${analysis.pr.merged ? "MERGED" : analysis.pr.state}  URL: ${analysis.pr.url}`,
  )
  const failedChecks = analysis.pr.checks.filter((c) => c.conclusion === "failure")
  if (failedChecks.length > 0) {
    lines.push(
      `  CI: ${failedChecks.length} failing check(s): ${failedChecks.map((c) => c.name).join(", ")}`,
    )
  }
  for (const failure of analysis.pr.partialFailures) {
    lines.push(`  ! partial failure: ${failure}`)
  }
  if (analysis.items.length === 0) {
    lines.push("\n  No comments or reviews found.")
    lines.push("  OSSPilot never replies to maintainers automatically.")
    return lines.join("\n")
  }
  lines.push(`\n  FEEDBACK ITEMS (${analysis.items.length}):`)
  for (const item of analysis.items) {
    const icon = item.severity === "blocking" ? "✗" : item.severity === "approval" ? "✓" : "•"
    const label = item.source === "review" ? `review:${item.state ?? "?"}` : "comment"
    lines.push(`    ${icon} [${label}] ${item.author ?? "unknown"} — ${item.severity}`)
    lines.push(`      ${item.body.slice(0, 300)}${item.body.length > 300 ? "…" : ""}`)
    if (item.inferredFiles.length > 0)
      lines.push(`      files mentioned: ${item.inferredFiles.join(", ")}`)
  }
  lines.push(
    "\n  File mentions are heuristically extracted — verify against the actual discussion.",
  )
  lines.push("  OSSPilot never replies to maintainers automatically.")
  return lines.join("\n")
}

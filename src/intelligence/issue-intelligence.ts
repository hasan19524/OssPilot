/**
 * Issue Intelligence.
 *
 * Classifies issues, detects likely duplicates / stale / already-resolved /
 * actively-worked issues using verified GitHub signals. LLM assessment is
 * optional and clearly labelled — never presented as fact.
 */

import type { GitHubClient } from "../integrations/github/client"
import { getIssue, type Issue, listIssueComments } from "../integrations/github/issues"
import { listPullRequests } from "../integrations/github/pull-requests"

export type IssueCategory =
  | "bug"
  | "feature"
  | "documentation"
  | "testing"
  | "refactor"
  | "performance"
  | "security"
  | "accessibility"
  | "maintenance"
  | "unclassified"

export interface IssueSignals {
  isStale: boolean
  daysOld: number
  daysSinceUpdate: number
  hasOpenPr: boolean
  openPrCount: number
  hasMaintainerGuidance: boolean
  isReproducible: boolean | null
  discussionCount: number
  suspectedDuplicate: boolean
  alreadyResolved: boolean
}

export interface IssueIntelligenceReport {
  issue: Issue
  category: IssueCategory
  signals: IssueSignals
  classificationEvidence: string[]
  verifiedFacts: string[]
  aiAssessment: string | null
}

const CATEGORY_PATTERNS: Array<{ category: IssueCategory; test: RegExp }> = [
  {
    category: "bug",
    test: /\b(bug|regression|broken|crash|fails?|error|exception|incorrect|unexpected)\b/i,
  },
  { category: "documentation", test: /\b(docs?|documentation|readme|typo|jsdoc|guide)\b/i },
  { category: "testing", test: /\b(test|coverage|spec|e2e|unit test)\b/i },
  { category: "performance", test: /\b(performance|slow|memory|latency|optimi[sz]e)\b/i },
  { category: "security", test: /\b(security|vulnerab|cve|xss|injection|csrf|auth)\b/i },
  { category: "accessibility", test: /\b(accessibility|a11y|screen reader|aria|wcag)\b/i },
  { category: "feature", test: /\b(feature|add|support|implement|enable|new)\b/i },
  { category: "refactor", test: /\b(refactor|clean ?up|simplify|dedup|reorgani[sz]e)\b/i },
]

export async function analyseIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
  options: { staleAfterDays?: number } = {},
): Promise<IssueIntelligenceReport> {
  const staleAfterDays = options.staleAfterDays ?? 90
  const issue = await getIssue(client, owner, repo, number)
  const classificationEvidence: string[] = []
  const verifiedFacts: string[] = []

  // --- Classification from title + body + labels ---
  const text = `${issue.title}\n${issue.body ?? ""}\n${issue.labels.join(" ")}`
  let category: IssueCategory = "unclassified"
  for (const pattern of CATEGORY_PATTERNS) {
    const match = text.match(pattern.test)
    if (match) {
      category = pattern.category
      classificationEvidence.push(`Matched "${match[0].slice(0, 40)}" → ${pattern.category}`)
      break
    }
  }
  if (category === "unclassified") {
    classificationEvidence.push("No dominant signal found — treated as unclassified")
  }

  // --- Verified facts ---
  verifiedFacts.push(`State: ${issue.state}`)
  verifiedFacts.push(`Author: ${issue.author ?? "unknown"}`)
  verifiedFacts.push(`Labels: ${issue.labels.join(", ") || "none"}`)
  verifiedFacts.push(`Comments: ${issue.commentsCount}`)
  verifiedFacts.push(`Created: ${issue.createdAt}`)
  verifiedFacts.push(`Updated: ${issue.updatedAt}`)

  // --- Age / staleness ---
  const daysOld = Math.max(
    0,
    Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / 86_400_000),
  )
  const daysSinceUpdate = Math.max(
    0,
    Math.floor((Date.now() - new Date(issue.updatedAt).getTime()) / 86_400_000),
  )
  const isStale = issue.state === "open" && daysSinceUpdate > staleAfterDays

  // --- Existing PRs referencing this issue ---
  const prs = await listPullRequests(client, owner, repo, "open").catch(() => [])
  const relatedPrs = prs.filter(
    (pr) =>
      pr.title.includes(`#${number}`) ||
      (pr.body ?? "").includes(`#${number}`) ||
      (pr.body ?? "").toLowerCase().includes(`fixes #${number}`) ||
      (pr.body ?? "").toLowerCase().includes(`closes #${number}`) ||
      (pr.body ?? "").toLowerCase().includes(`resolves #${number}`),
  )
  const hasOpenPr = relatedPrs.length > 0

  // --- Maintainer guidance (heuristic: comments present containing assignment) ---
  const comments = await listIssueComments(client, owner, repo, number).catch(() => [])
  const hasMaintainerGuidance = comments.some((c) =>
    /\b(i (?:assigned|took)|@\S+ (?:please|can you)|up for grabs|assigned to|self[- ]assign)\b/i.test(
      c.body,
    ),
  )

  // --- Already resolved ---
  const alreadyResolved = issue.state === "closed"

  // --- Duplicate suspicion (heuristic) ---
  const suspectedDuplicate = /(duplicate|same as|dup of|see #\d+)/i.test(
    `${issue.title} ${issue.body ?? ""}`,
  )

  return {
    issue,
    category,
    signals: {
      isStale,
      daysOld,
      daysSinceUpdate,
      hasOpenPr,
      openPrCount: relatedPrs.length,
      hasMaintainerGuidance,
      isReproducible: issue.body ? issue.body.length > 80 : null,
      discussionCount: comments.length,
      suspectedDuplicate,
      alreadyResolved,
    },
    classificationEvidence,
    verifiedFacts,
    aiAssessment: null,
  }
}

export function formatIssueIntelligence(report: IssueIntelligenceReport): string {
  const s = report.signals
  const lines: string[] = []
  lines.push(`\nISSUE INTELLIGENCE — #${report.issue.number}: ${report.issue.title}`)
  lines.push(
    `  Category: ${report.category} (${report.classificationEvidence.length ? "evidence below" : "no signal"})`,
  )
  lines.push("")
  lines.push("  VERIFIED GITHUB FACTS:")
  for (const f of report.verifiedFacts) lines.push(`    - ${f}`)
  lines.push(`    - Age: ${s.daysOld} day(s), last update ${s.daysSinceUpdate} day(s) ago`)
  lines.push("")
  lines.push("  SIGNALS:")
  if (s.alreadyResolved) lines.push("    ✗ Already resolved (issue closed)")
  if (s.suspectedDuplicate) lines.push("    ✗ Suspected duplicate")
  if (s.hasOpenPr) lines.push(`    ✗ ${s.openPrCount} open PR(s) already reference this issue`)
  if (s.isStale) lines.push(`    ⚠ Stale: no activity for ${s.daysSinceUpdate} days`)
  if (s.hasMaintainerGuidance) lines.push("    ✓ Maintainer guidance found in comments")
  if (s.isReproducible === false)
    lines.push("    ⚠ Very short description — may need clarification")
  if (s.isReproducible === true) lines.push("    ✓ Description has substantive detail")
  if (!s.alreadyResolved && !s.suspectedDuplicate && !s.hasOpenPr && !s.isStale) {
    lines.push("    ✓ No blocking signals detected")
  }
  lines.push("")
  lines.push("  CLASSIFICATION EVIDENCE:")
  for (const e of report.classificationEvidence) lines.push(`    - ${e}`)
  lines.push("")
  lines.push("  Labels are signals, not proof of suitability. Verify against the discussion above.")
  lines.push("  No guarantee of merge acceptance is made or implied.")
  return lines.join("\n")
}

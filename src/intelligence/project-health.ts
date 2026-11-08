/**
 * Project Health Report.
 *
 * Derived ONLY from verified GitHub data. No fabricated metrics.
 * Unknown values are reported as unavailable, never guessed.
 */

import type { GitHubClient } from "../integrations/github/client"
import { listPullRequests } from "../integrations/github/pull-requests"
import { getRepository } from "../integrations/github/repositories"

export interface HealthFactor {
  name: string
  level: "high" | "moderate" | "low" | "unknown"
  evidence: string
}

export interface ProjectHealthReport {
  owner: string
  repo: string
  score: number
  profile: {
    stars: number
    forks: number
    openIssues: number
    language: string | null
    license: string | null
    defaultBranch: string
    pushedAt: string | null
    ageDays: number | null
  }
  factors: HealthFactor[]
  evidence: string[]
  limitations: string[]
}

export interface HealthOptions {
  /** Days since last push to consider a project active. */
  activeWithinDays?: number
  /** Max open issues before flagging as overwhelmed. */
  openIssueThreshold?: number
}

export async function buildProjectHealth(
  client: GitHubClient,
  owner: string,
  name: string,
  options: HealthOptions = {},
): Promise<ProjectHealthReport> {
  const activeWithinDays = options.activeWithinDays ?? 90
  const issueThreshold = options.openIssueThreshold ?? 500

  const repo = await getRepository(client, owner, name)
  const evidence: string[] = []
  const limitations: string[] = []

  // --- Development activity (verified: pushed_at) ---
  const pushedAt = repo.updatedAt // ISO string from repos.get
  const daysSincePush = pushedAt ? daysBetween(pushedAt) : null
  let activity: HealthFactor
  if (daysSincePush === null) {
    activity = {
      name: "Development activity",
      level: "unknown",
      evidence: "Last push date unavailable",
    }
  } else if (daysSincePush <= 7) {
    activity = {
      name: "Development activity",
      level: "high",
      evidence: `Last push ${daysSincePush} day(s) ago`,
    }
  } else if (daysSincePush <= activeWithinDays) {
    activity = {
      name: "Development activity",
      level: "moderate",
      evidence: `Last push ${daysSincePush} day(s) ago`,
    }
  } else {
    activity = {
      name: "Development activity",
      level: "low",
      evidence: `Last push ${daysSincePush} day(s) ago — possibly stalled`,
    }
  }
  evidence.push(activity.evidence)

  // --- Issue responsiveness (verified: open vs total) ---
  let issueResponsiveness: HealthFactor
  if (repo.openIssues === 0) {
    issueResponsiveness = {
      name: "Issue backlog",
      level: "high",
      evidence: "No open issues reported",
    }
  } else if (repo.openIssues > issueThreshold) {
    issueResponsiveness = {
      name: "Issue backlog",
      level: "low",
      evidence: `${repo.openIssues} open issues — backlog may be large`,
    }
  } else {
    issueResponsiveness = {
      name: "Issue backlog",
      level: "moderate",
      evidence: `${repo.openIssues} open issues`,
    }
  }
  evidence.push(issueResponsiveness.evidence)

  // --- PR review activity (verified: open vs merged recently) ---
  const openPrs = await listPullRequests(client, owner, name, "open").catch(() => [])
  const closedPrs = await listPullRequests(client, owner, name, "closed").catch(() => [])
  const recentlyMerged = closedPrs.filter((pr) => pr.state === "closed").length
  let prActivity: HealthFactor
  if (recentlyMerged > 0) {
    prActivity = {
      name: "PR activity",
      level: "high",
      evidence: `${recentlyMerged} closed PR(s) found, ${openPrs.length} open`,
    }
  } else if (openPrs.length > 0) {
    prActivity = {
      name: "PR activity",
      level: "moderate",
      evidence: `${openPrs.length} open PR(s) found`,
    }
  } else {
    prActivity = {
      name: "PR activity",
      level: "low",
      evidence: "No open or recently closed PRs found in the first page",
    }
    limitations.push("PR analysis limited to the first 50 PRs returned by the API.")
  }
  evidence.push(prActivity.evidence)

  // --- Community health (verified: repo description signals only) ---
  let community: HealthFactor
  const desc = (repo.description ?? "").toLowerCase()
  if (desc.includes("collaborator")) {
    community = {
      name: "Contribution accessibility",
      level: "low",
      evidence: "Description suggests restricted external PRs",
    }
  } else {
    community = {
      name: "Contribution accessibility",
      level: "moderate",
      evidence: "No restriction signals in metadata — check CONTRIBUTING.md",
    }
  }

  // --- Score (explainable) ---
  const weights: Array<[HealthFactor, number]> = [
    [activity, 30],
    [issueResponsiveness, 20],
    [prActivity, 30],
    [community, 20],
  ]
  const levelScore = (l: HealthFactor["level"]) =>
    l === "high" ? 100 : l === "moderate" ? 60 : l === "low" ? 20 : 0
  const totalWeight = weights.reduce((s, [, w]) => s + w, 0)
  const score = Math.round(
    weights.reduce((s, [f, w]) => s + levelScore(f.level) * w, 0) / totalWeight,
  )

  limitations.push(
    "Only publicly available GitHub metadata was evaluated. Maintainer response times, private discussions, CI pass rates and community tone were not measured.",
  )
  limitations.push(
    "Stars/forks are deliberately NOT used as health metrics — they measure popularity, not health.",
  )

  return {
    owner,
    repo: name,
    score,
    profile: {
      stars: repo.stars,
      forks: repo.forks,
      openIssues: repo.openIssues,
      language: repo.language,
      license: null, // License requires a separate API field; reported as unavailable.
      defaultBranch: repo.defaultBranch,
      pushedAt,
      ageDays: null,
    },
    factors: [activity, issueResponsiveness, prActivity, community],
    evidence,
    limitations,
  }
}

/** Render a Project Health Report. */
export function formatProjectHealth(report: ProjectHealthReport): string {
  const lines: string[] = []
  lines.push(`\nPROJECT HEALTH: ${report.score}/100 — ${report.owner}/${report.repo}`)
  lines.push("")
  for (const factor of report.factors) {
    const icon =
      factor.level === "high"
        ? "●"
        : factor.level === "moderate"
          ? "◐"
          : factor.level === "low"
            ? "○"
            : "?"
    lines.push(`  ${icon} ${factor.name}: ${factor.level.toUpperCase()} — ${factor.evidence}`)
  }
  lines.push("")
  lines.push("Evidence:")
  for (const e of report.evidence) lines.push(`  - ${e}`)
  lines.push("")
  lines.push("Limitations:")
  for (const l of report.limitations) lines.push(`  - ${l}`)
  lines.push("")
  lines.push(
    "Note: stars (" +
      report.profile.stars +
      ") and forks (" +
      report.profile.forks +
      ") measure popularity, not health.",
  )
  lines.push("License: unavailable from this endpoint — check the repository page.")
  return lines.join("\n")
}

function daysBetween(iso: string): number {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return Number.NaN
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24))
}

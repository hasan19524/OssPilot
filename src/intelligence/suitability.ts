/**
 * Contribution Suitability Engine.
 *
 * Explainable scoring. Distinguishes measured facts from AI assessments.
 * Never claims a guaranteed merge.
 */

import type { IssueIntelligenceReport } from "./issue-intelligence"
import type { ProjectHealthReport } from "./project-health"

export interface SuitabilityInput {
  health: ProjectHealthReport
  issue: IssueIntelligenceReport
  userSkills: string[]
}

export interface SuitabilityFactor {
  name: string
  score: number
  weight: number
  basis: "verified" | "ai_assessment" | "unavailable"
  explanation: string
}

export interface SuitabilityReport {
  score: number
  recommendation: string
  factors: SuitabilityFactor[]
  blockers: string[]
  warnings: string[]
  matchedSkills: string[]
  skillsToLearn: string[]
  limitations: string[]
}

function scoreIssueHealth(issue: IssueIntelligenceReport): SuitabilityFactor {
  const s = issue.signals
  let score = 60
  const reasons: string[] = []
  if (s.alreadyResolved) {
    score = 0
    reasons.push("issue is closed")
  } else {
    if (!s.suspectedDuplicate) {
      score += 15
    } else {
      score -= 40
      reasons.push("suspected duplicate")
    }
    if (!s.hasOpenPr) {
      score += 20
    } else {
      score -= 45
      reasons.push(`${s.openPrCount} open PR(s) exist`)
    }
    if (s.isReproducible === true) {
      score += 10
    }
    if (s.isStale) {
      score -= 25
      reasons.push(`stale (${s.daysSinceUpdate}d)`)
    }
    if (s.hasMaintainerGuidance) {
      score += 10
      reasons.push("maintainer guidance present")
    }
  }
  return {
    name: "Issue eligibility",
    score: Math.max(0, Math.min(100, score)),
    weight: 35,
    basis: "verified",
    explanation:
      reasons.length > 0
        ? `Based on: ${reasons.join("; ")}`
        : "No blocking signals; issue is open and actionable",
  }
}

function scoreProjectHealth(health: ProjectHealthReport): SuitabilityFactor {
  return {
    name: "Project health",
    score: health.score,
    weight: 25,
    basis: "verified",
    explanation: `From GitHub activity signals: ${health.factors.map((f) => `${f.name}=${f.level}`).join(", ")}`,
  }
}

function scoreSkillMatch(skills: string[], text: string): SuitabilityFactor {
  const normalised = skills.map((s) => s.toLowerCase().trim()).filter(Boolean)
  if (normalised.length === 0) {
    return {
      name: "Skill compatibility",
      score: 50,
      weight: 20,
      basis: "unavailable",
      explanation: "No skills configured — run 'osspilot config' and set your skills",
    }
  }
  const hay = text.toLowerCase()
  const matched = normalised.filter((s) => hay.includes(s))
  const missing = normalised.filter((s) => !hay.includes(s))
  const ratio = matched.length / Math.max(1, normalised.length)
  const usedRatio = missing.length > 0 ? ratio : 1
  return {
    name: "Skill compatibility",
    score: Math.round(50 + usedRatio * 50),
    weight: 20,
    basis: "verified",
    explanation:
      missing.length === 0
        ? `No configured skill appears in the issue text — neutral score`
        : `${matched.length}/${normalised.length} configured skills appear in the issue text (${matched.join(", ") || "none"})`,
  }
}

function scoreClarity(issue: IssueIntelligenceReport): SuitabilityFactor {
  const len = (issue.issue.body ?? "").length
  let score = 50
  if (len > 500) score = 90
  else if (len > 200) score = 75
  else if (len > 80) score = 60
  else score = 30
  return {
    name: "Issue clarity",
    score,
    weight: 20,
    basis: "unavailable",
    explanation: `Description length ${len} chars (length is a proxy for detail, not quality)`,
  }
}

export function buildSuitabilityReport(input: SuitabilityInput): SuitabilityReport {
  const { health, issue, userSkills } = input
  const issueText = `${issue.issue.title} ${issue.issue.body ?? ""} ${issue.issue.labels.join(" ")}`

  const factors = [
    scoreIssueHealth(issue),
    scoreProjectHealth(health),
    scoreClarity(issue),
    scoreSkillMatch(userSkills, issueText),
  ]

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0)
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / totalWeight)

  const blockers: string[] = []
  if (issue.signals.alreadyResolved) blockers.push("Issue is already closed.")
  if (issue.signals.hasOpenPr)
    blockers.push(`${issue.signals.openPrCount} open PR(s) already address this issue.`)
  if (issue.signals.suspectedDuplicate) blockers.push("Issue appears to be a duplicate.")

  const warnings: string[] = []
  if (issue.signals.isStale) warnings.push(`No activity for ${issue.signals.daysSinceUpdate} days.`)
  if (health.score < 40)
    warnings.push("Project health score is low — maintainer response is uncertain.")

  const matchedSkills = userSkills.filter((s) => issueText.toLowerCase().includes(s.toLowerCase()))
  const skillsToLearn = userSkills.filter((s) => !issueText.toLowerCase().includes(s.toLowerCase()))

  let recommendation: string
  if (blockers.length > 0) recommendation = "Not recommended — blocking signals present."
  else if (score >= 80) recommendation = "Strong candidate."
  else if (score >= 60) recommendation = "Viable candidate — review the evidence first."
  else if (score >= 40) recommendation = "Marginal — expect extra effort or maintainer discussion."
  else recommendation = "Weak candidate."

  return {
    score,
    recommendation,
    factors,
    blockers,
    warnings,
    matchedSkills,
    skillsToLearn,
    limitations: [
      "Scores are computed from public GitHub signals only; they are not predictions of acceptance.",
      "AI assessments are not included in this score.",
      "Merge acceptance is always decided by project maintainers.",
    ],
  }
}

export function formatSuitability(report: SuitabilityReport): string {
  const lines: string[] = []
  lines.push(`\nCONTRIBUTION SUITABILITY: ${report.score}/100`)
  lines.push(`  ${report.recommendation}`)
  lines.push("")
  for (const f of report.factors) {
    const basisLabel =
      f.basis === "verified" ? "verified" : f.basis === "ai_assessment" ? "AI" : "unavailable"
    lines.push(`  ${f.name}: ${f.score}/100 (weight ${f.weight}%, ${basisLabel})`)
    lines.push(`    ${f.explanation}`)
  }
  if (report.matchedSkills.length > 0)
    lines.push(`\n  Matched skills: ${report.matchedSkills.join(", ")}`)
  if (report.skillsToLearn.length > 0)
    lines.push(`  Unmatched skills: ${report.skillsToLearn.join(", ")}`)
  if (report.blockers.length > 0) {
    lines.push("\n  BLOCKERS:")
    for (const b of report.blockers) lines.push(`    ✗ ${b}`)
  }
  if (report.warnings.length > 0) {
    lines.push("\n  WARNINGS:")
    for (const w of report.warnings) lines.push(`    ⚠ ${w}`)
  }
  lines.push("\n  Limitations:")
  for (const l of report.limitations) lines.push(`    - ${l}`)
  return lines.join("\n")
}

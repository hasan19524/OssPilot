/**
 * Contribution requirements extraction.
 *
 * Reads repo files (CONTRIBUTING.md, PR templates, etc.) and derives explicit
 * requirements a contributor must satisfy. All content is treated as UNTRUSTED
 * input — it is parsed for requirements, never executed.
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

export interface ContributionRequirements {
  hasContributing: boolean
  hasCodeOfConduct: boolean
  hasSecurityPolicy: boolean
  hasPrTemplate: boolean
  hasIssueTemplates: boolean
  requiresDco: boolean
  requiresCla: boolean
  requiresSignedCommits: boolean
  commitConvention: string | null
  branchConvention: string | null
  testRequirement: string | null
  hasAgentsFile: boolean
  aiContributionPolicy: string | null
  claProvider: string | null
  evidence: string[]
}

const MARKER_PATTERNS: Array<{
  key: keyof ContributionRequirements
  test: RegExp
  value?: string
}> = [
  {
    key: "requiresDco",
    test: /(?:DCO|Developer Certificate of Origin|sign[- ]off|signed[- ]off)/i,
  },
  { key: "requiresCla", test: /(?:CLA|Contributor License Agreement)/i },
  { key: "requiresSignedCommits", test: /(?:signed commits?|-S flag|git commit -S|GPG)/i },
  {
    key: "commitConvention",
    test: /(?:conventional commits?|commit message (?:convention|format|guidelines))/i,
  },
  { key: "branchConvention", test: /(?:branch naming|branch (?:name|convention|format))/i },
  {
    key: "testRequirement",
    test: /(?:must (?:add|include|write) tests?|tests? (?:are )?required|run (?:the )?tests?)/i,
  },
  {
    key: "aiContributionPolicy",
    test: /(?:AI[- ]generated|AI contribution|LLM|assisted by AI|disclose AI|AI[- ]assisted)/i,
  },
]

function safeRead(path: string, maxBytes = 20000): string | null {
  try {
    if (!existsSync(path)) return null
    const content = readFileSync(path, "utf8")
    return content.length > maxBytes ? `${content.slice(0, maxBytes)}\n... (truncated)` : content
  } catch {
    return null
  }
}

function detectMarkers(
  text: string,
  source: string,
): {
  flags: Partial<Record<string, boolean | string>>
  evidence: string[]
} {
  const flags: Record<string, boolean | string> = {}
  const evidence: string[] = []
  for (const marker of MARKER_PATTERNS) {
    const match = text.match(marker.test)
    if (match) {
      flags[marker.key] = marker.value ?? true
      evidence.push(`${source}: "${match[0].slice(0, 80)}"`)
    }
  }
  return { flags, evidence }
}

/** Inspect a local repository checkout for contribution requirements. */
export function inspectContributionRequirements(repoPath: string): ContributionRequirements {
  const evidence: string[] = []
  const result: ContributionRequirements = {
    hasContributing: false,
    hasCodeOfConduct: false,
    hasSecurityPolicy: false,
    hasPrTemplate: false,
    hasIssueTemplates: false,
    requiresDco: false,
    requiresCla: false,
    requiresSignedCommits: false,
    commitConvention: null,
    branchConvention: null,
    testRequirement: null,
    hasAgentsFile: false,
    aiContributionPolicy: null,
    claProvider: null,
    evidence: [],
  }

  // Presence checks
  const contributing =
    safeRead(join(repoPath, "CONTRIBUTING.md")) ??
    safeRead(join(repoPath, "docs", "CONTRIBUTING.md"))
  result.hasContributing = contributing !== null
  if (contributing) evidence.push("CONTRIBUTING.md found")

  result.hasCodeOfConduct =
    existsSync(join(repoPath, "CODE_OF_CONDUCT.md")) ||
    existsSync(join(repoPath, ".github", "CODE_OF_CONDUCT.md"))
  if (result.hasCodeOfConduct) evidence.push("CODE_OF_CONDUCT.md found")

  result.hasSecurityPolicy =
    existsSync(join(repoPath, "SECURITY.md")) ||
    existsSync(join(repoPath, ".github", "SECURITY.md"))
  if (result.hasSecurityPolicy) evidence.push("SECURITY.md found")

  result.hasPrTemplate =
    existsSync(join(repoPath, ".github", "PULL_REQUEST_TEMPLATE.md")) ||
    existsSync(join(repoPath, ".github", "pull_request_template.md"))
  if (result.hasPrTemplate) evidence.push("PR template found")

  result.hasIssueTemplates = existsSync(join(repoPath, ".github", "ISSUE_TEMPLATE"))
  if (result.hasIssueTemplates) evidence.push("Issue templates found")

  result.hasAgentsFile =
    existsSync(join(repoPath, "AGENTS.md")) || existsSync(join(repoPath, "CLAUDE.md"))
  if (result.hasAgentsFile) evidence.push("AGENTS.md / CLAUDE.md found")

  // Markers from contributing + agents docs
  const docs = [
    contributing,
    safeRead(join(repoPath, "AGENTS.md")),
    safeRead(join(repoPath, ".github", "PULL_REQUEST_TEMPLATE.md")),
  ]
  for (const doc of docs) {
    if (!doc) continue
    const { flags, evidence: ev } = detectMarkers(doc, "requirements doc")
    for (const [k, v] of Object.entries(flags)) {
      const key = k as keyof ContributionRequirements
      const current = result[key]
      if (current === false || current === null) {
        ;(result as unknown as Record<string, unknown>)[key] = v
      }
      evidence.push(...ev)
    }
  }

  // CLA provider detection
  if (contributing) {
    const claMatch = contributing.match(
      /(?:cla-assistant|CLA assistant|easycla|linux foundation CLA)/i,
    )
    if (claMatch) result.claProvider = claMatch[0]
  }

  result.evidence = evidence
  return result
}

/** Summarise requirements for display. */
export function summariseRequirements(req: ContributionRequirements): string {
  const lines: string[] = ["Contribution requirements:"]
  lines.push(`  CONTRIBUTING.md: ${req.hasContributing ? "found" : "MISSING"}`)
  lines.push(`  Code of Conduct: ${req.hasCodeOfConduct ? "found" : "not found"}`)
  lines.push(`  Security policy: ${req.hasSecurityPolicy ? "found" : "not found"}`)
  lines.push(`  PR template: ${req.hasPrTemplate ? "found" : "not found"}`)
  lines.push(`  DCO sign-off: ${req.requiresDco ? "REQUIRED" : "not detected"}`)
  lines.push(
    `  CLA: ${req.requiresCla ? `REQUIRED${req.claProvider ? ` (${req.claProvider})` : ""}` : "not detected"}`,
  )
  lines.push(`  Signed commits: ${req.requiresSignedCommits ? "REQUIRED" : "not detected"}`)
  if (req.commitConvention) lines.push(`  Commit convention: detected`)
  if (req.aiContributionPolicy)
    lines.push(`  AI policy: disclosed in docs — review before submitting`)
  return lines.join("\n")
}

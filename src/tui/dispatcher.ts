/**
 * TUI command dispatcher.
 *
 * Routes composer input / command-palette actions to the SAME application
 * services the CLI uses. No business logic here — only routing.
 *
 * Every result carries the state it implies (`context`, `messages`, `view`)
 * so the TUI can render the sidebar and transcript from real backend state
 * instead of placeholders.
 *
 * Natural-language requests are recognised deterministically and then executed
 * by the same handlers the slash commands use; anything unrecognised returns
 * guidance rather than a fabricated answer.
 */

import { existsSync } from "node:fs"
import { agentRegistry, bootstrapAgentRegistry } from "../agents/registry"
import { ensurePaths, getPaths } from "../config/paths"
import { loadUserConfig } from "../config/settings"
import { ContributionManager } from "../core/contributions"
import { ConversationService } from "../core/conversation"
import { createGitHubClient } from "../integrations/github/client"
import { getIssue, listOpenIssues } from "../integrations/github/issues"
import { type GitHubRef, parseGitHubRef } from "../integrations/github/ref"

import { getRepository, searchRepositories } from "../integrations/github/repositories"
import { analyseIssue, formatIssueIntelligence } from "../intelligence/issue-intelligence"
import { buildProjectHealth, formatProjectHealth } from "../intelligence/project-health"
import { formatRepoInspection, inspectRepository } from "../intelligence/repo-inspection"
import {
  inspectContributionRequirements,
  summariseRequirements,
} from "../intelligence/requirements"
import { buildSuitabilityReport, formatSuitability } from "../intelligence/suitability"
import { detectLocalRepository } from "../workspace/local-repository"
import { RepositoryManager } from "../workspace/manager"
import { detectLanguage, recognizeIntent } from "./intent"
import type { Message, PendingApproval, TuiState } from "./store"

/** Sidebar fields a handler can update from real results. */
export type ContextUpdate = Partial<
  Pick<
    TuiState,
    | "sessionId"
    | "repoOwner"
    | "repoName"
    | "branch"
    | "issueNumber"
    | "issueTitle"
    | "contributionStage"
    | "changedFiles"
    | "diffStat"
  >
>

/** Bridge to the interactive approval dialog and the activity feed. */
export interface ContributionBridge {
  requestApproval: (approval: PendingApproval) => Promise<boolean>
  appendActivity: (line: string) => void
}

/** What the TUI knows when the message is dispatched. */
export interface DispatchContext {
  /** Repository selected in the sidebar (`/select`), if any. */
  selectedRef?: GitHubRef | null
  /** Issue selected in the sidebar, if any. */
  selectedIssue?: number | null
  /** Terminal working directory, used to resolve "this repository". */
  cwd?: string
  /** Repository detected from `cwd`, cached per dispatch. */
  localRef?: GitHubRef | null
  /** Interactive bridge; absent when dispatch runs non-interactively. */
  bridge?: ContributionBridge
  /** Live sidebar update while a long-running handler is still executing. */
  setContext?: (update: ContextUpdate) => void
}

export interface DispatchResult {
  output: string[]
  /** Optional follow-up action the TUI should surface (approval, etc.). */
  action?: { kind: "approve-plan" | "approve-pr" | "cancel"; target?: string }
  /** Interactive approval the TUI should present to the user. */
  approval?: PendingApproval
  /** Sidebar state implied by this result — the TUI merges it into the store. */
  context?: ContextUpdate
  /** Replace the visible transcript (session switch / new conversation). */
  messages?: Message[]
  /** View the TUI should switch to. */
  view?: "conversation" | "history" | "agents"
}

export interface HandlerContext {
  emit: (line: string) => void
  context: DispatchContext
}

type Handler = (args: string[], ctx: HandlerContext) => Promise<DispatchResult>

const done = (lines: string[]): DispatchResult => ({ output: lines })

/**
 * Documented placeholders such as `owner/repository` are examples, not
 * repositories. Accepting them would produce a confusing upstream 404.
 */
const PLACEHOLDER =
  /^(owner|user|org|username|yourname|example)\/(repository|repo|project|example)(#\d+)?$/i

function placeholderRejection(raw: string): DispatchResult | null {
  if (!PLACEHOLDER.test(raw)) return null
  return done([
    `"${raw}" is the placeholder from the docs, not a real repository.`,
    "Replace it with an actual GitHub reference, for example:",
    "  /research octocat/Hello-World#1",
    "  /issues microsoft/vscode",
  ])
}

/** Re-throw user cancellation so it reaches the TUI instead of becoming a fake error. */
function rethrowIfCancelled(error: unknown): void {
  if (error instanceof Error && /Cancelled by user/.test(error.message)) throw error
}

/** Turn an upstream failure into something the user can act on. Never leaks secrets. */
function explainGitHubError(error: unknown, subject: string): string[] {
  rethrowIfCancelled(error)
  const text = error instanceof Error ? error.message : String(error)
  if (/Not Found|\b404\b/.test(text)) {
    return [
      `${subject} was not found on GitHub (404).`,
      "Check the owner/repository spelling and the issue number.",
      "Example: /research octocat/Hello-World#1",
    ]
  }
  if (/Bad credentials|\b401\b|Unauthorized/i.test(text)) {
    return [
      "GitHub rejected the credentials (401).",
      'Run "osspilot config auth github", or set OSSPILOT_GITHUB_TOKEN, then retry.',
    ]
  }
  if (/rate limit|secondary rate|\b403\b|Forbidden/i.test(text)) {
    return [
      "GitHub rate-limited or refused the request (403).",
      'Authenticated requests allow 5000/hour — run "osspilot doctor" to check your token.',
      "Wait a moment and retry.",
    ]
  }
  if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|fetch failed|network/i.test(text)) {
    return [
      "Network error while talking to GitHub.",
      "Check your connection/proxy and retry.",
      `Underlying error: ${text}`,
    ]
  }
  return [`${subject} failed: ${text}`]
}

/** Resolve `origin` of the working directory, once per dispatch. */
async function resolveLocalRef(context: DispatchContext): Promise<GitHubRef | null> {
  if (context.localRef !== undefined) return context.localRef
  const detected = await detectLocalRepository(context.cwd ?? process.cwd())
  context.localRef = detected
  return detected
}

/** Explicit reference > selected repository > repository open in this terminal. */
async function resolveRepository(
  explicit: string | undefined,
  context: DispatchContext,
): Promise<{
  ref: GitHubRef | null
  source: "argument" | "selected" | "local" | "none" | "invalid"
  raw?: string
}> {
  if (explicit) {
    const parsed = parseGitHubRef(explicit)
    if (parsed) return { ref: parsed, source: "argument" }
    // An explicit-but-unreadable reference must fail loudly instead of
    // silently falling back to some other repository.
    return { ref: null, source: "invalid", raw: explicit }
  }
  if (context.selectedRef) return { ref: context.selectedRef, source: "selected" }
  const local = await resolveLocalRef(context)
  if (local) return { ref: local, source: "local" }
  return { ref: null, source: "none" }
}

const NO_REPOSITORY = [
  "I could not determine which repository you mean.",
  "Give it explicitly (owner/repository), select one with /select owner/repository,",
  "or run OSSPilot from inside a cloned repository so I can read its origin remote.",
]

function invalidReference(raw: string, usage: string): DispatchResult {
  return done([`"${raw}" is not a GitHub reference. Expected owner/repository.`, usage])
}

export const HANDLERS: Record<string, Handler> = {
  help: async () =>
    done([
      "Commands:",
      "  /discover <query> [--language <lang>]  find repositories on GitHub",
      "  /issues [owner/repo] [--beginner-friendly]  browse open issues (defaults to this repository)",
      "  /research <owner/repo|owner/repo#N>    full intelligence report",
      "  /explain [owner/repo]                  inspect and explain a codebase",
      "  /plan <owner/repo#N>                   generate a contribution plan",
      "  /contribute <owner/repo#N>             run the full workflow with approval gates",
      "  /select <owner/repo[#N]>               put a repository/issue in the sidebar",
      "  /agents                                coding agent status",
      "  /status                                active contributions",
      "  /diff                                  show current worktree diff stat",
      "  /cancel                                cancel the active contribution",
      "  /history, /sessions                    list conversations",
      "  /new                                   start a new conversation",
      "  /resume <session-id>                   reopen a conversation",
      'Natural language works too, e.g. "find beginner TypeScript issues",',
      '"research octocat/Hello-World#1", "explain this repository".',
    ]),

  agents: async () => {
    bootstrapAgentRegistry()
    const lines: string[] = ["Coding agents:"]
    for (const adapter of agentRegistry.list()) {
      let status: string
      try {
        const report = await adapter.getStatusReport()
        status = `${report.state} ${report.version ?? ""}`.trim()
        if (report.provider) status += `  provider: ${report.provider}`
        if (report.model) status += `  model: ${report.model}`
        if (report.lastError) status += ` (last error: ${report.lastError})`
        for (const limitation of report.limitations) lines.push(`    ! ${limitation}`)
      } catch (error) {
        status = `status unavailable: ${String(error)}`
      }
      lines.push(`  ${adapter.name}: ${status}`)
      if (adapter.experimental) lines.push("    (experimental)")
    }
    lines.push("")
    lines.push('Run "opencode auth login" and configure a provider if the state is NOT_CONFIGURED.')
    return done(lines)
  },

  status: async () => {
    const manager = new ContributionManager()
    try {
      const active = manager.listActive()
      if (active.length === 0)
        return done(["No active contributions.", "Start one with /contribute owner/repo#123."])

      const lines = [`Active contributions (${active.length}):`]
      let quiet = 0
      for (const c of active) {
        const last = manager.events(c.id, 1)[0]
        const worktree = c.worktreePath
          ? existsSync(c.worktreePath)
            ? "worktree on disk"
            : "worktree missing"
          : "no worktree yet"
        const ageMs = last ? Date.now() - last.createdAt.getTime() : Number.POSITIVE_INFINITY
        if (ageMs > 60 * 60 * 1000) quiet++
        lines.push(`  ${c.id}  ${c.repoOwner}/${c.repoName}#${c.issueNumber ?? "?"}  ${c.stage}`)
        lines.push(
          `     ${worktree}${last ? `  last activity ${last.createdAt.toISOString().slice(0, 16).replace("T", " ")}` : "  no events recorded"}`,
        )
      }
      if (quiet > 0) {
        lines.push("")
        lines.push(
          `${quiet} of these have had no activity for over an hour — they were interrupted when a previous run stopped.`,
        )
        lines.push(
          "Records survive restarts by design. Inspect or abandon one with: osspilot resume <contribution-id>",
        )
      }
      const first = active[0]
      return {
        output: lines,
        context: first
          ? {
              repoOwner: first.repoOwner,
              repoName: first.repoName,
              branch: first.branchName ?? "",
              issueNumber: first.issueNumber ?? null,
              issueTitle: first.issueTitle ?? "",
              contributionStage: first.stage,
            }
          : undefined,
      }
    } finally {
      manager.close()
    }
  },

  sessions: async () => {
    const conv = new ConversationService()
    try {
      const list = conv.listSessions({ limit: 30 })
      if (list.length === 0) return done(["No conversations yet."])
      const lines = [`Conversations (${list.length}):`]
      for (const s of list) {
        lines.push(`  ${s.id}  ${s.title}`)
        lines.push(
          `     ${s.repoOwner ? `${s.repoOwner}/${s.repoName}` : "no repository"}  updated ${s.updatedAt.toISOString().slice(0, 16).replace("T", " ")}`,
        )
      }
      lines.push("")
      lines.push("Use /resume <session-id> to reopen one.")
      return { output: lines, view: "history" }
    } finally {
      conv.close()
    }
  },

  history: async () => {
    const conv = new ConversationService()
    try {
      const list = conv.listSessions({ limit: 30 })
      if (list.length === 0) return done(["No conversation history yet."])
      const lines = ["Conversation history:"]
      for (const s of list) {
        lines.push(`  ${s.id}  ${s.title}  [${s.status}]`)
        lines.push(`     updated ${s.updatedAt.toISOString().slice(0, 16).replace("T", " ")}`)
      }
      return { output: lines, view: "history" }
    } finally {
      conv.close()
    }
  },

  new: async () => {
    const conv = new ConversationService()
    try {
      const s = conv.createSession({ title: "New conversation" })
      return {
        output: [`Started conversation ${s.id}.`, "It becomes active now."],
        context: { sessionId: s.id } as never,
        messages: [],
      }
    } finally {
      conv.close()
    }
  },

  resume: async (args) => {
    const id = (args[0] ?? "").trim()
    if (!id) return done(["Usage: /resume <session-id>", "Use /history to list sessions."])
    const conv = new ConversationService()
    try {
      const session = conv.getSession(id)
      if (!session) return done([`No session named ${id}. Use /history to list sessions.`])
      return {
        output: [`Resumed conversation ${id}: ${session.title}`],
        messages: conv.listMessages(id),
        context: { sessionId: id } as never,
      }
    } finally {
      conv.close()
    }
  },

  select: async (args, ctx) => {
    ensurePaths()
    const raw = (args[0] ?? "").trim()
    if (!raw) {
      return done([
        "Usage: /select owner/repository or /select owner/repository#123",
        "The selected repository/issue is what 'this repository' means in natural language.",
      ])
    }
    const rejected = placeholderRejection(raw)
    if (rejected) return rejected
    const ref = parseGitHubRef(raw)
    if (!ref)
      return done([
        `Could not read "${raw}" as a GitHub reference.`,
        "Usage: /select owner/repository or /select owner/repository#123",
      ])

    ctx.emit(`Selecting ${ref.owner}/${ref.repo}...`)
    try {
      const client = await createGitHubClient()
      const repo = await getRepository(client, ref.owner, ref.repo)
      let issueTitle = ""
      if (ref.issueNumber) {
        try {
          const issue = await getIssue(client, ref.owner, ref.repo, ref.issueNumber)
          issueTitle = issue.title
        } catch (error) {
          return {
            output: explainGitHubError(error, `Issue ${ref.owner}/${ref.repo}#${ref.issueNumber}`),
          }
        }
      }
      const lines = [`Selected ${repo.fullName} (★${repo.stars}, ${repo.language ?? "unknown"}).`]
      if (ref.issueNumber) lines.push(`Issue #${ref.issueNumber}: ${issueTitle}`)
      else lines.push("No issue selected yet — add one with /select owner/repository#123.")
      return {
        output: lines,
        context: {
          repoOwner: ref.owner,
          repoName: ref.repo,
          branch: repo.defaultBranch,
          issueNumber: ref.issueNumber ?? null,
          issueTitle,
        },
      }
    } catch (error) {
      return { output: explainGitHubError(error, `${ref.owner}/${ref.repo}`) }
    }
  },

  discover: async (args, ctx) => {
    ensurePaths()
    // Flag-aware positional parsing: `--language x` must not leave `x` in the
    // query (it used to produce queries like "python python").
    const positionals: string[] = []
    let explicitLanguage: string | undefined
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? ""
      if (arg === "--language") {
        explicitLanguage = args[i + 1]
        i++
        continue
      }
      if (arg.startsWith("--")) continue
      if (arg.length > 0) positionals.push(arg)
    }
    const rawQuery = positionals.join(" ").trim()

    // A bare language name ("typescript") is a language filter, not a keyword.
    const inferred = detectLanguage(rawQuery)
    const language = explicitLanguage ?? inferred ?? undefined
    const query = rawQuery.length > 0 ? rawQuery : "good first issue"

    ctx.emit(`Searching GitHub for "${query}"${language ? ` (language: ${language})` : ""}...`)
    try {
      const client = await createGitHubClient()
      const repos = await searchRepositories(client, query, { language, perPage: 8 })

      if (repos.length === 0)
        return done([
          `No repositories found for "${query}".`,
          "Try a broader term, e.g. /discover api.",
        ])
      const lines = [`Found ${repos.length} repository(ies):`]
      for (const r of repos) {
        // Progress line doubles as a cancellation safe point.
        ctx.emit(`  inspecting ${r.fullName}...`)
        lines.push(`  ${r.fullName}  ★${r.stars}  ${r.language ?? "—"}`)
        lines.push(`    ${(r.description ?? "").slice(0, 100)}`)
        try {
          const issues = await listOpenIssues(client, r.owner, r.name, { perPage: 3 })
          const good = issues.filter((i) =>
            i.labels.some((l) => /good first|help wanted|hacktoberfest/i.test(l)),
          )
          for (const i of (good.length > 0 ? good : issues.slice(0, 2)).slice(0, 3)) {
            lines.push(
              `    #${i.number} ${i.title.slice(0, 80)}  [${i.labels.slice(0, 3).join(", ")}]`,
            )
          }
        } catch {
          // issue listing is best-effort — the repository result is still valid
        }
        lines.push("")
      }
      lines.push("Select one with /select owner/repository, then /issues or /research.")
      return done(lines)
    } catch (error) {
      return { output: explainGitHubError(error, `Repository search for "${query}"`) }
    }
  },

  issues: async (args, ctx) => {
    ensurePaths()
    const explicit = args.filter((a) => !a.startsWith("--"))[0]
    const { ref, source, raw } = await resolveRepository(explicit, ctx.context)
    if (source === "invalid" && raw) return invalidReference(raw, "Usage: /issues owner/repository")
    if (!ref) return { output: NO_REPOSITORY }

    ctx.emit(`Listing open issues in ${ref.owner}/${ref.repo}...`)
    try {
      const client = await createGitHubClient()
      const beginner = args.includes("--beginner-friendly")
      let issues: Awaited<ReturnType<typeof listOpenIssues>> = []
      let labelNote = ""
      if (beginner) {
        // Prefer the standard labels; fall back honestly instead of faking a
        // beginner-friendly result.
        for (const labels of [["good first issue"], ["help wanted"]]) {
          issues = await listOpenIssues(client, ref.owner, ref.repo, { labels, perPage: 15 })
          if (issues.length > 0) {
            labelNote = `  [filtered by label: ${labels[0]}]`
            break
          }
        }
        if (issues.length === 0) {
          issues = await listOpenIssues(client, ref.owner, ref.repo, { perPage: 15 })
          labelNote = "  [no beginner-labelled issues found — showing all open issues]"
        }
      } else {
        issues = await listOpenIssues(client, ref.owner, ref.repo, { perPage: 15 })
      }
      const where = source === "local" ? " (this repository)" : ""
      if (issues.length === 0)
        return {
          output: [`No open issues in ${ref.owner}/${ref.repo}${where}.`],
          context: { repoOwner: ref.owner, repoName: ref.repo },
        }
      const headline = beginner ? "Beginner-friendly issues" : "Open issues"
      const lines = [
        `${headline} in ${ref.owner}/${ref.repo} (${issues.length})${where}:${labelNote}`,
      ]
      for (const i of issues) {
        lines.push(`  #${i.number} ${i.title.slice(0, 70)}`)
        lines.push(
          `    labels: ${i.labels.slice(0, 4).join(", ") || "—"}  comments: ${i.commentsCount}`,
        )
      }
      lines.push("")
      lines.push(`Research one with /research ${ref.owner}/${ref.repo}#<number>`)
      return {
        output: lines,
        context: { repoOwner: ref.owner, repoName: ref.repo, contributionStage: "DISCOVER" },
      }
    } catch (error) {
      return { output: explainGitHubError(error, `Issues in ${ref.owner}/${ref.repo}`) }
    }
  },

  research: async (args, ctx) => {
    ensurePaths()
    const raw = (args[0] ?? "").trim()
    if (!raw)
      return done([
        "Usage: /research owner/repository or owner/repository#123",
        "Example: /research octocat/Hello-World#1",
      ])
    const rejected = placeholderRejection(raw)
    if (rejected) return rejected
    const ref = parseGitHubRef(raw)
    if (!ref)
      return done([
        `Could not read "${raw}" as a GitHub reference.`,
        "Usage: /research owner/repository or owner/repository#123",
      ])

    const config = loadUserConfig(getPaths())
    ctx.emit(
      `Researching ${ref.owner}/${ref.repo}${ref.issueNumber ? `#${ref.issueNumber}` : ""}...`,
    )

    const lines: string[] = []
    let issueTitle = ""
    try {
      const client = await createGitHubClient()
      const health = await buildProjectHealth(client, ref.owner, ref.repo)
      lines.push(formatProjectHealth(health))

      if (ref.issueNumber) {
        ctx.emit(`Analysing issue #${ref.issueNumber}...`)
        const issue = await analyseIssue(client, ref.owner, ref.repo, ref.issueNumber)
        issueTitle = issue.issue.title
        lines.push(formatIssueIntelligence(issue))
        const suitability = buildSuitabilityReport({ health, issue, userSkills: config.skills })
        lines.push(formatSuitability(suitability))
        lines.push("")
        lines.push(`Next: /plan ${ref.owner}/${ref.repo}#${ref.issueNumber}`)
      } else {
        lines.push("")
        lines.push(
          `No issue specified — add #<number> for issue intelligence: /research ${ref.owner}/${ref.repo}#123`,
        )
      }
      lines.push("")
      lines.push("All facts above come from the GitHub API. Nothing here is invented.")
      return {
        output: lines,
        context: {
          repoOwner: ref.owner,
          repoName: ref.repo,
          issueNumber: ref.issueNumber ?? null,
          issueTitle,
          contributionStage: "RESEARCH",
        },
      }
    } catch (error) {
      return {
        output: explainGitHubError(error, `Research on ${ref.owner}/${ref.repo}`),
        context: { repoOwner: ref.owner, repoName: ref.repo },
      }
    }
  },

  explain: async (args, ctx) => {
    ensurePaths()
    const explicit = (args[0] ?? "").trim()
    const { ref, source, raw } = await resolveRepository(explicit || undefined, ctx.context)
    if (source === "invalid" && raw)
      return invalidReference(raw, "Usage: /explain [owner/repository]")
    if (!ref) return { output: NO_REPOSITORY }

    const paths = getPaths()
    const repoManager = new RepositoryManager(paths.repositoriesDir)
    let repoPath: string
    let cloned = false

    // Same repository as the one open in this terminal → inspect it in place.
    const local = await resolveLocalRef(ctx.context)
    if (local && local.owner === ref.owner && local.repo === ref.repo && ctx.context.cwd) {
      repoPath = ctx.context.cwd
    } else {
      ctx.emit(`Cloning ${ref.owner}/${ref.repo} for inspection...`)
      try {
        repoPath = await repoManager.clone(
          ref.owner,
          ref.repo,
          `https://github.com/${ref.owner}/${ref.repo}.git`,
        )
        cloned = true
      } catch (error) {
        return {
          output: explainGitHubError(error, `Clone of ${ref.owner}/${ref.repo}`),
          context: { repoOwner: ref.owner, repoName: ref.repo },
        }
      }
    }

    ctx.emit(`Inspecting ${repoPath}...`)
    try {
      const report = await inspectRepository(repoPath)
      const requirements = inspectContributionRequirements(repoPath)
      const lines = [formatRepoInspection(report), "", summariseRequirements(requirements)]
      lines.push("")
      lines.push(
        repoPath === ctx.context.cwd
          ? "Inspected the repository open in this terminal (no clone needed)."
          : cloned
            ? `Cloned to ${repoPath} for inspection.`
            : `Inspected the cached copy at ${repoPath}.`,
      )
      return {
        output: lines,
        context: { repoOwner: ref.owner, repoName: ref.repo, contributionStage: "INSPECT" },
      }
    } catch (error) {
      rethrowIfCancelled(error)
      return { output: [`Repository inspection failed: ${String(error)}`] }
    }
  },

  plan: async (args, ctx) => {
    bootstrapAgentRegistry()
    ensurePaths()
    const raw = (args[0] ?? "").trim()
    if (!raw)
      return done([
        "Usage: /plan owner/repository#123",
        "Find an issue first: /issues owner/repository",
      ])
    const rejected = placeholderRejection(raw)
    if (rejected) return rejected
    const ref = parseGitHubRef(raw)
    if (!ref)
      return done([
        `Could not read "${raw}" as a GitHub reference.`,
        "Usage: /plan owner/repository#123",
      ])
    if (!ref.issueNumber) {
      return done([
        `A plan needs an issue number: /plan ${ref.owner}/${ref.repo}#123`,
        `List candidates with /issues ${ref.owner}/${ref.repo}`,
      ])
    }

    const config = loadUserConfig(getPaths())
    const manager = new ContributionManager()

    try {
      ctx.emit(`Building contribution plan for ${ref.owner}/${ref.repo}#${ref.issueNumber}...`)
      const client = await createGitHubClient()
      const repo = await getRepository(client, ref.owner, ref.repo)
      const health = await buildProjectHealth(client, ref.owner, ref.repo)
      const issue = await analyseIssue(client, ref.owner, ref.repo, ref.issueNumber)
      const suitability = buildSuitabilityReport({ health, issue, userSkills: config.skills })

      const lines: string[] = []
      lines.push(`CONTRIBUTION PLAN — ${ref.owner}/${ref.repo}#${ref.issueNumber}`)
      lines.push(`  Issue: ${issue.issue.title}`)
      lines.push(`  Category: ${issue.category}`)
      lines.push(`  Suitability: ${suitability.score}/100 — ${suitability.recommendation}`)
      if (suitability.blockers.length > 0) {
        lines.push("  BLOCKERS:")
        for (const b of suitability.blockers) lines.push(`    ✗ ${b}`)
        lines.push("")
        lines.push("  Plan NOT recommended. Aborting before any approval prompt.")
        return { output: lines, context: issueContext(ref, issue.issue.title, "BLOCKED") }
      }
      lines.push("  Proposed steps:")
      lines.push("    1. Clone repository and create an isolated worktree")
      lines.push("    2. OpenCode investigates the issue (read-only)")
      lines.push("    3. You approve the plan")
      lines.push("    4. OpenCode implements the fix + regression test")
      lines.push("    5. Independent verification runs tests/lint/diff")
      lines.push("    6. You approve commit and PR creation")
      lines.push(`  Repo language: ${repo.language ?? "unknown"}`)
      lines.push("")
      lines.push(`  Run /contribute ${ref.owner}/${ref.repo}#${ref.issueNumber} to execute it.`)

      const contribution = await manager.create({
        repoOwner: ref.owner,
        repoName: ref.repo,
        issueNumber: ref.issueNumber,
        issueTitle: issue.issue.title,
        agentId: config.preferredAgent,
      })
      lines.push(`  Contribution record created: ${contribution.id}`)
      return {
        output: lines,
        context: {
          ...issueContext(ref, issue.issue.title, "CONTRIBUTION_PLAN"),
          branch: contribution.branchName ?? "",
        },
      }
    } catch (error) {
      return {
        output: explainGitHubError(error, `Plan for ${ref.owner}/${ref.repo}#${ref.issueNumber}`),
        context: { repoOwner: ref.owner, repoName: ref.repo, issueNumber: ref.issueNumber },
      }
    } finally {
      manager.close()
    }
  },

  diff: async () => {
    const manager = new ContributionManager()
    try {
      const active = manager.listActive()
      const c = active[0]
      if (!c?.worktreePath) return done(["No active contribution with a worktree."])
      const { WorktreeManager } = await import("../workspace/manager")
      const wm = new WorktreeManager()
      const [stat, files] = await Promise.all([
        wm.diffStat(c.worktreePath),
        wm.changedFiles(c.worktreePath),
      ])
      const lines = [
        `Worktree: ${c.worktreePath}`,
        "",
        stat || "(no changes)",
        "",
        `Changed files (${files.length}):`,
      ]
      for (const f of files) lines.push(`  ${f}`)
      return {
        output: lines,
        context: {
          repoOwner: c.repoOwner,
          repoName: c.repoName,
          branch: c.branchName ?? "",
          issueNumber: c.issueNumber ?? null,
          issueTitle: c.issueTitle ?? "",
          contributionStage: c.stage,
          diffStat: stat,
          changedFiles: files,
        },
      }
    } catch (error) {
      return { output: [`Diff failed: ${String(error)}`] }
    } finally {
      manager.close()
    }
  },

  cancel: async () => {
    const manager = new ContributionManager()
    try {
      const active = manager.listActive()
      const c = active[0]
      if (!c) return done(["Nothing to cancel."])
      await manager.cancel(c.id, "Cancelled from TUI")
      return {
        output: [
          `Contribution ${c.id} cancelled.`,
          "Worktree and clone were preserved. The branch was never pushed, so no external action was taken.",
        ],
        context: { contributionStage: "CANCELLED" },
      }
    } catch (error) {
      return { output: [`Cancel failed: ${String(error)}`] }
    } finally {
      manager.close()
    }
  },

  contribute: async (args, ctx) => {
    const raw = (args[0] ?? "").trim()
    if (!raw)
      return done([
        "Usage: /contribute owner/repository#123",
        "The workflow stops at every approval gate; nothing is pushed without you.",
      ])
    const rejected = placeholderRejection(raw)
    if (rejected) return rejected
    const ref = parseGitHubRef(raw)
    if (!ref?.issueNumber)
      return done([
        `A contribution needs an issue number: /contribute ${raw}#123`,
        `Find one with /issues ${raw.split("#")[0] ?? raw}`,
      ])
    if (!ctx.context.bridge) {
      return done([
        "/contribute needs an interactive session for its approval gates.",
        "Run it from the TUI (this screen), or use the CLI: osspilot contribute owner/repo#123",
      ])
    }
    return dispatchContribution(raw, ctx.context.bridge, ctx.context.setContext)
  },
}

/**
 * `/contribute owner/repo#N` — drives the full lifecycle through the shared
 * runner, using the TUI approval store as the approval gate.
 */
export async function dispatchContribution(
  reference: string,
  bridge: ContributionBridge,
  setContext?: (update: ContextUpdate) => void,
): Promise<DispatchResult> {
  const { runContribution } = await import("../core/contribution-runner")
  const ref = parseGitHubRef(reference)
  const baseContext: ContextUpdate = ref
    ? {
        repoOwner: ref.owner,
        repoName: ref.repo,
        issueNumber: ref.issueNumber ?? null,
        contributionStage: "FETCH",
      }
    : {}
  // The sidebar must reflect the target repository/issue the moment the
  // workflow starts, not only when it finishes.
  if (Object.keys(baseContext).length > 0) setContext?.(baseContext)
  const lines: string[] = []
  try {
    const result = await runContribution({
      reference,
      approver: {
        ask: async (prompt, details, options) =>
          bridge.requestApproval({
            kind: "approve-plan",
            prompt,
            details,
            options: options ?? ["Confirm", "Reject"],
          }),
      },
      events: {
        onOutput: (line) => {
          lines.push(line)
          bridge.appendActivity(line)
        },
        onProgress: (stage, detail) => bridge.appendActivity(`[${stage}] ${detail}`),
      },
    })
    lines.push(`Contribution ${result.contributionId} finished at stage ${result.stage}.`)
    if (result.prUrl) lines.push(`PR: ${result.prUrl}`)
    else lines.push("No PR was created (not approved or skipped).")
    return {
      output: lines,
      context: {
        ...baseContext,
        branch: result.branchName,
        contributionStage: result.stage,
        changedFiles: [],
        diffStat: "",
      },
    }
  } catch (error) {
    rethrowIfCancelled(error)
    lines.push(`Contribution failed: ${String(error)}`)
    return { output: lines, context: { ...baseContext, contributionStage: "FAILED" } }
  }
}

function issueContext(ref: GitHubRef, title: string, stage: string): ContextUpdate {
  return {
    repoOwner: ref.owner,
    repoName: ref.repo,
    issueNumber: ref.issueNumber ?? null,
    issueTitle: title,
    contributionStage: stage,
  }
}

/** Commands whose arguments may fall back to the repository in `cwd`. */
const NEEDS_LOCAL = new Set(["issues", "explain", "plan", "contribute"])

export interface DispatchOptions {
  /** Sidebar/session state the TUI currently holds. */
  context?: DispatchContext
}

/** Dispatch a line of composer input to the right service. */
export async function dispatch(
  input: string,
  emit: (line: string) => void,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const context: DispatchContext = options.context ?? {}
  const trimmed = input.trim()
  if (!trimmed) return done([])

  const handlerCtx: HandlerContext = { emit, context }

  const runCommand = async (command: string, args: string[]): Promise<DispatchResult> => {
    const handler = HANDLERS[command]
    if (!handler)
      return done([
        `Unknown command: /${command}`,
        `Available: ${Object.keys(HANDLERS)
          .map((k) => `/${k}`)
          .join(" ")}`,
        "Type /help for descriptions.",
      ])
    if (NEEDS_LOCAL.has(command) && context.selectedRef === undefined) {
      await resolveLocalRef(context)
    }
    return handler(args, handlerCtx)
  }

  if (trimmed === "/help" || trimmed === "help") return runCommand("help", [])

  if (trimmed.startsWith("/")) {
    const [rawCmd, ...rest] = trimmed.slice(1).split(/\s+/)
    return runCommand(rawCmd?.toLowerCase() ?? "", rest)
  }

  const intent = recognizeIntent(trimmed, {
    selectedRef: context.selectedRef ?? null,
    selectedIssue: context.selectedIssue ?? null,
    localRef: context.localRef ?? null,
  })

  if (intent.kind === "reply") return done(intent.lines)

  if (intent.kind === "command") return runCommand(intent.command, intent.args)

  return done([
    "I could not map that to an action I can actually perform.",
    "I will not fabricate a result — here is what I do support:",
    "  find Python repositories                  -> /discover",
    "  find issues in this repository            -> /issues",
    "  research owner/repository#123             -> /research",
    "  explain this repository                   -> /explain",
    "  help me plan a contribution               -> /plan",
    "Type /help for the full command list.",
  ])
}

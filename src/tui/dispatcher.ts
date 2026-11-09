/**
 * TUI command dispatcher.
 *
 * Routes composer input / command-palette actions to the SAME application
 * services the CLI uses. No business logic here — only routing.
 *
 * Natural-language requests are pattern-matched into service calls; anything
 * unrecognised returns guidance rather than a fabricated answer.
 */

import { agentRegistry, bootstrapAgentRegistry } from "../agents/registry"
import { ensurePaths, getPaths } from "../config/paths"
import { loadUserConfig } from "../config/settings"
import { ContributionManager } from "../core/contributions"
import { ConversationService } from "../core/conversation"
import { createGitHubClient } from "../integrations/github/client"
import { listOpenIssues } from "../integrations/github/issues"
import { parseGitHubRef } from "../integrations/github/ref"
import { getRepository, searchRepositories } from "../integrations/github/repositories"
import { analyseIssue, formatIssueIntelligence } from "../intelligence/issue-intelligence"
import { buildProjectHealth, formatProjectHealth } from "../intelligence/project-health"
import { buildSuitabilityReport, formatSuitability } from "../intelligence/suitability"

export interface DispatchResult {
  output: string[]
  /** Optional follow-up action the TUI should surface (approval, etc.). */
  action?: { kind: "approve-plan" | "approve-pr" | "cancel"; target?: string }
  /** Interactive approval the TUI should present to the user. */
  approval?: import("./store").PendingApproval
}

type Handler = (args: string[], emit: (line: string) => void) => Promise<DispatchResult>

const done = (lines: string[]): DispatchResult => ({ output: lines })

const HANDLERS: Record<string, Handler> = {
  help: async () =>
    done([
      "Commands:",
      "  /discover <query> [--language <lang>]  find repositories",
      "  /issues <owner/repo>                  browse open issues",
      "  /research <owner/repo|owner/repo#N>   full intelligence report",
      "  /plan <owner/repo#N>                  generate a contribution plan",
      "  /agents                               coding agent status",
      "  /status                               active contributions",
      "  /diff                                 show current worktree diff stat",
      "  /contribute <owner/repo#N>            run the full contribution workflow",
      "  /cancel                               cancel the active contribution",
      "  /history, /sessions                   list conversations",
      "  /new                                  start a new conversation",
      "  /resume <session-id>                  reopen a conversation",
      'Natural language also works, e.g. "find beginner TypeScript issues".',
    ]),

  agents: async () => {
    bootstrapAgentRegistry()
    const lines: string[] = ["Coding agents:"]
    for (const adapter of agentRegistry.list()) {
      let status: string
      try {
        const report = await adapter.getStatusReport()
        status = `${report.state} ${report.version ?? ""}`.trim()
        if (report.lastError) status += ` (last error: ${report.lastError})`
      } catch (error) {
        status = `status unavailable: ${String(error)}`
      }
      lines.push(`  ${adapter.name}: ${status}`)
      if (adapter.experimental) lines.push("    (experimental)")
    }
    return done(lines)
  },

  status: async () => {
    const manager = new ContributionManager()
    try {
      const active = manager.listActive()
      if (active.length === 0) return done(["No active contributions."])
      const lines = ["Active contributions:"]
      for (const c of active)
        lines.push(`  ${c.id}  ${c.repoOwner}/${c.repoName}#${c.issueNumber ?? "?"}  ${c.stage}`)
      return done(lines)
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
      return done(lines)
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
      return done(lines)
    } finally {
      conv.close()
    }
  },

  new: async () => {
    const conv = new ConversationService()
    try {
      const s = conv.createSession({ title: "New conversation" })
      return done([`Started conversation ${s.id}.`, "It becomes active once you send a message."])
    } finally {
      conv.close()
    }
  },

  discover: async (args, emit) => {
    ensurePaths()
    const query = args.filter((a) => !a.startsWith("--"))[0] ?? "good first issue"
    const langIdx = args.indexOf("--language")
    const language = langIdx >= 0 ? args[langIdx + 1] : undefined

    emit(`Searching GitHub for "${query}"${language ? ` (${language})` : ""}...`)
    const client = await createGitHubClient()
    const repos = await searchRepositories(client, query, { language, perPage: 8 })

    if (repos.length === 0) return done(["No repositories found."])
    const lines = [`Found ${repos.length} repository(ies):`]
    for (const r of repos) {
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
        // issue listing is best-effort
      }
      lines.push("")
    }
    return done(lines)
  },

  issues: async (args) => {
    ensurePaths()
    const ref = parseGitHubRef(args[0] ?? "")
    if (!ref) return done(["Usage: /issues owner/repository"])
    const client = await createGitHubClient()
    const issues = await listOpenIssues(client, ref.owner, ref.repo, { perPage: 15 })
    if (issues.length === 0) return done([`No open issues in ${ref.owner}/${ref.repo}.`])
    const lines = [`Open issues in ${ref.owner}/${ref.repo} (${issues.length}):`]
    for (const i of issues) {
      lines.push(`  #${i.number} ${i.title.slice(0, 70)}`)
      lines.push(
        `    labels: ${i.labels.slice(0, 4).join(", ") || "—"}  comments: ${i.commentsCount}`,
      )
    }
    return done(lines)
  },

  research: async (args, emit) => {
    ensurePaths()
    const raw = args[0] ?? ""
    const ref = parseGitHubRef(raw)
    if (!ref) return done(["Usage: /research owner/repository or owner/repository#123"])

    const client = await createGitHubClient()
    const config = loadUserConfig(getPaths())

    emit(`Researching ${ref.owner}/${ref.repo}${ref.issueNumber ? `#${ref.issueNumber}` : ""}...`)
    const lines: string[] = []

    try {
      const health = await buildProjectHealth(client, ref.owner, ref.repo)
      lines.push(formatProjectHealth(health))

      if (ref.issueNumber) {
        const issue = await analyseIssue(client, ref.owner, ref.repo, ref.issueNumber)
        lines.push(formatIssueIntelligence(issue))
        const suitability = buildSuitabilityReport({ health, issue, userSkills: config.skills })
        lines.push(formatSuitability(suitability))
      }
    } catch (error) {
      lines.push(`Research failed: ${String(error)}`)
    }
    return done(lines)
  },

  plan: async (args, emit) => {
    bootstrapAgentRegistry()
    ensurePaths()
    const ref = parseGitHubRef(args[0] ?? "")
    if (!ref?.issueNumber) return done(["Usage: /plan owner/repository#123"])

    const client = await createGitHubClient()
    const config = loadUserConfig(getPaths())
    const manager = new ContributionManager()

    try {
      emit(`Building contribution plan for ${ref.owner}/${ref.repo}#${ref.issueNumber}...`)
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
        return done(lines)
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
      lines.push(`  Run \`osspilot contribute ${args[0] ?? ""}\` to execute with approval gates.`)

      const contribution = await manager.create({
        repoOwner: ref.owner,
        repoName: ref.repo,
        issueNumber: ref.issueNumber,
        issueTitle: issue.issue.title,
        agentId: config.preferredAgent,
      })
      lines.push(`  Contribution record created: ${contribution.id}`)
      return done(lines)
    } catch (error) {
      return done([`Plan generation failed: ${String(error)}`])
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
      return done(lines)
    } catch (error) {
      return done([`Diff failed: ${String(error)}`])
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
      return done([
        `Contribution ${c.id} cancelled.`,
        "Worktree and clone were preserved. The branch was never pushed, so no external action was taken.",
      ])
    } catch (error) {
      return done([`Cancel failed: ${String(error)}`])
    } finally {
      manager.close()
    }
  },
}

/**
 * `/contribute owner/repo#N` — drives the full lifecycle through the shared
 * runner, using the TUI approval store as the approval gate.
 *
 * Registered separately because it needs access to the approval bridge.
 */
export async function dispatchContribution(
  reference: string,
  store: {
    requestApproval: (approval: import("./store").PendingApproval) => Promise<boolean>
    appendActivity: (line: string) => void
  },
): Promise<DispatchResult> {
  const { runContribution } = await import("../core/contribution-runner")
  const lines: string[] = []
  try {
    const result = await runContribution({
      reference,
      approver: {
        ask: async (prompt, details, options) =>
          store.requestApproval({
            kind: "approve-plan",
            prompt,
            details,
            options: options ?? ["Confirm", "Reject"],
          }),
      },
      events: {
        onOutput: (line) => {
          lines.push(line)
          store.appendActivity(line)
        },
        onProgress: (stage, detail) => store.appendActivity(`[${stage}] ${detail}`),
      },
    })
    lines.push(`Contribution ${result.contributionId} finished at stage ${result.stage}.`)
    if (result.prUrl) lines.push(`PR: ${result.prUrl}`)
    else lines.push("No PR was created (not approved or skipped).")
    return { output: lines }
  } catch (error) {
    lines.push(`Contribution failed: ${String(error)}`)
    return { output: lines }
  }
}

const NATURAL_LANGUAGE_MAP: Array<{ pattern: RegExp; command: string }> = [
  { pattern: /\b(find|search|discover)\b.*\b(repositor|projects?)\b/i, command: "discover" },
  { pattern: /\b(find|show|browse|list)\b.*\bissues?\b/i, command: "issues" },
  { pattern: /\b(research|analys[ez]e|investigate|explain)\b/i, command: "research" },
  { pattern: /\b(plan|prepare)\b.*\b(contribution|issue)\b/i, command: "plan" },
  { pattern: /\b(diff|changes|what changed)\b/i, command: "diff" },
  { pattern: /\b(cancel|stop|abort)\b/i, command: "cancel" },
  { pattern: /\b(agents?|opencode)\b/i, command: "agents" },
  { pattern: /\b(status|progress|active)\b/i, command: "status" },
]

/** Dispatch a line of composer input to the right service. */ export async function dispatch(
  input: string,
  emit: (line: string) => void,
): Promise<DispatchResult> {
  const trimmed = input.trim()
  if (!trimmed) return done([])

  if (trimmed === "/help" || trimmed === "help") {
    const helpHandler = HANDLERS.help
    if (helpHandler) return helpHandler([], emit)
    return done(["Type /help for available commands."])
  }
  if (trimmed.startsWith("/")) {
    const [rawCmd, ...rest] = trimmed.slice(1).split(/\s+/)
    const cmd = rawCmd?.toLowerCase() ?? ""
    const handler = HANDLERS[cmd]
    if (!handler) return done([`Unknown command: /${cmd}`, "Type /help for available commands."])
    return handler(rest, emit)
  }

  for (const map of NATURAL_LANGUAGE_MAP) {
    if (map.pattern.test(trimmed)) {
      const handler = HANDLERS[map.command]
      if (!handler) continue
      const ref = parseGitHubRef(trimmed)
      return handler(
        ref ? [trimmed.match(/([\w.-]+\/[\w.-]+(?:#\d+)?)/)?.[1] ?? trimmed] : [trimmed],
        emit,
      )
    }
  }

  return done([
    "I could not map that to an action I can actually perform.",
    "I will not fabricate a result. Try /help, or use a form like:",
    "  /research owner/repository#123",
    "  /discover typescript",
  ])
}

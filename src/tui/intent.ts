/**
 * Deterministic natural-language intent recognition for the TUI.
 *
 * OSSPilot stays the workflow orchestrator: a recognised request is turned
 * into a *service call* handled by the same dispatcher handlers the slash
 * commands use. Nothing here calls a model, so recognition keeps working when
 * no LLM provider is configured and never invents an answer of its own.
 *
 * Recognition is pure and dependency-free (the repository reference comes in
 * through `IntentContext`), which makes it directly unit-testable.
 */

import { type GitHubRef, parseGitHubRef } from "../integrations/github/ref"

/** What the TUI already knows when the user starts typing. */
export interface IntentContext {
  /** Repository selected in the sidebar (`/select`), if any. */
  selectedRef?: GitHubRef | null
  /** Issue selected in the sidebar, if any. */
  selectedIssue?: number | null
  /** Repository detected from the terminal working directory, if any. */
  localRef?: GitHubRef | null
}

export type Intent =
  /** Route to the dispatcher handler `command` with these (already resolved) arguments. */
  | { kind: "command"; command: string; args: string[] }
  /** Answer directly — conversational input that needs no workflow. */
  | { kind: "reply"; lines: string[] }
  /** Nothing matched. The dispatcher explains what it supports instead of guessing. */
  | { kind: "unmapped" }

/**
 * Programming languages recognised for `--language` inference.
 *
 * Used both to satisfy "find Python repositories" style requests and to make
 * `/discover typescript` apply a real `language:` qualifier instead of relying
 * on free-text relevance.
 */
export const KNOWN_LANGUAGES = [
  "bash",
  "c",
  "c#",
  "c++",
  "clojure",
  "css",
  "dart",
  "elixir",
  "go",
  "graphql",
  "haskell",
  "html",
  "java",
  "javascript",
  "julia",
  "kotlin",
  "lua",
  "markdown",
  "objective-c",
  "php",
  "perl",
  "powershell",
  "python",
  "r",
  "ruby",
  "rust",
  "scala",
  "shell",
  "sql",
  "swift",
  "typescript",
  "vue",
  "zig",
] as const

const KNOWN_LANGUAGE_SET: ReadonlySet<string> = new Set(KNOWN_LANGUAGES.map((l) => l.toLowerCase()))

/** Return the language name when `value` is a known language, else null. */
export function detectLanguage(value: string): string | null {
  const normalised = value.trim().toLowerCase()
  if (KNOWN_LANGUAGE_SET.has(normalised)) return normalised
  // Small aliases that matter for search qualifiers.
  const aliases: Record<string, string> = {
    js: "javascript",
    ts: "typescript",
    golang: "go",
    "c sharp": "c#",
    "c sharp ": "c#",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "shell",
    yml: "shell",
  }
  return aliases[normalised] ?? null
}

/**
 * Command rules, ranked by where their anchor keyword first appears.
 *
 * Ranking (rather than array order) is what makes ambiguous sentences such as
 * "find repositories with good first issues" resolve to `discover` while
 * "find beginner-friendly issues in this repository" resolves to `issues`.
 */
interface Rule {
  command: string
  /** Must match for the rule to be a candidate. */
  pattern: RegExp
  /** Its first match position ranks the candidate. */
  anchor: RegExp
}

const RULES: Rule[] = [
  {
    command: "discover",
    pattern:
      /\b(find|search|discover|look for|show|list|browse|give me)\b[\s\S]*\b(repositories|repos|projects|libraries|packages|codebases|sources?)\b/i,
    anchor:
      /\brepositories?\b|\brepos?\b|\bprojects?\b|\blibraries\b|\bpackages?\b|\bcodebases?\b/i,
  },
  {
    command: "issues",
    pattern:
      /\b(find|search|discover|browse|list|show|give me|are there|any|which|what)\b[\s\S]*\bissues?\b/i,
    anchor: /\bissues?\b/i,
  },
  {
    command: "plan",
    pattern:
      /\b(plan|prepare|draft|create|make|write|build|start)\b[\s\S]*\b(contribution|contributions|fix|patch|pull request|pr|implementation|change set)\b/i,
    anchor: /\b(contribution|contributions|fix|patch|pull request)\b/i,
  },
  {
    command: "research",
    pattern:
      /\b(research|investigate|investigation|analys[ez]|analysis|look into|deep dive|dig into|tell me about)\b/i,
    anchor:
      /\b(research|investigate|investigation|analys[ez]|analysis|look into|deep dive|dig into|tell me about)\b/i,
  },
  {
    command: "explain",
    pattern:
      /\b(explain|walk me through|describe|understand)\b|\bwhat is this (repo|repository|codebase|project)\b|\bhow does this (work|repo|repository|codebase)\b/i,
    anchor: /\b(explain|walk me through|describe|understand)\b|\bwhat is this\b|\bhow does this\b/i,
  },
  {
    command: "diff",
    pattern:
      /\b(show me (the )?diff|the diff|what changed|show (me )?(the )?changes)\b|^diff\b|\bdiff\b/i,
    anchor: /\bdiff\b|\bwhat changed\b/i,
  },
  {
    command: "cancel",
    pattern: /\b(cancel|abort|stop that|never mind|forget it)\b/i,
    anchor: /\b(cancel|abort)\b/i,
  },
  {
    command: "agents",
    pattern: /\b(coding agent|agent status|which agent|opencode|agents)\b/i,
    anchor: /\b(opencode|coding agent|agent status|agents)\b/i,
  },
  {
    command: "status",
    pattern:
      /\b(status|progress|active contributions|what are you working on|what is happening|what's happening)\b/i,
    anchor: /\b(status|progress)\b/i,
  },
]

/** Conversational input that deserves an answer rather than a routing error. */
const GREETING =
  /^(hi+|hey+|hello+|yo|howdy|hola|hi there|hey there|hello there|good (morning|afternoon|evening|day)|greetings|sup)[!.\s]*$/i
const PLEASANTRY =
  /^(how are you|how('s| is) it going|what('s| is) up|you (ok|okay)|how do you do|are you well|how have you been)[?!\s]*$/i
const THANKS =
  /^(thanks|thank you|thx|ty|cheers|appreciate (it|that)|nice|cool|perfect|great)[!.\s]*$/i
const IDENTITY =
  /^(who are you|what are you|what can you do|what do you do|what should i (type|ask)|help me|capabilities)[?!\s]*$/i

const CAPABILITY_GUIDANCE = [
  "I can run these workflows for you:",
  "  find Python repositories                      -> repository discovery",
  "  find beginner-friendly issues in owner/repo   -> issue discovery",
  "  research owner/repository#123                 -> evidence-backed issue research",
  "  explain this repository                       -> local codebase inspection",
  "  help me plan a contribution owner/repository#1 -> contribution plan",
  "",
  "Type /help for the full command list.",
]

function greetingReply(): string[] {
  return [
    "Hello — I'm OSSPilot, a terminal-native agent for open-source contributions.",
    "",
    ...CAPABILITY_GUIDANCE,
  ]
}

function identityReply(): string[] {
  return [
    "OSSPilot finds, researches and prepares open-source contributions locally.",
    "You stay in control: I never push, commit or open a pull request without your approval.",
    "",
    ...CAPABILITY_GUIDANCE,
  ]
}

function thanksReply(): string[] {
  return ["Any time. Type /help when you want the full command list."]
}

function pleasantReply(): string[] {
  return ["Doing well — ready when you are.", "", ...CAPABILITY_GUIDANCE]
}

/** Pull a `owner/repo` or `owner/repo#123` reference out of a sentence. */
export function extractRef(input: string): GitHubRef | null {
  const direct = input.match(
    /([A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+(?:#\d+)?)/,
  )
  if (!direct?.[1]) return null
  return parseGitHubRef(direct[1])
}

/** The reference the request is about: explicit > selected > local repository. */
function resolveRepository(input: string, context: IntentContext): GitHubRef | null {
  return extractRef(input) ?? context.selectedRef ?? context.localRef ?? null
}

/** Remove conversational filler so the remaining words can be a search query. */
function toSearchQuery(input: string): string {
  return input
    .replace(/--[a-z]+\s+\S+/gi, " ")
    .replace(
      /\b(can|could|please|i want to|i'd like to|i would like to|find|find me|search|search for|discover|look for|show|show me|list|list me|give me|me|some|any|good|first|beginner|beginner-friendly|friendly|open|source|oss|on|github|in|for|with|that|which|are|there|of|and|the|a|an|repositories|repository|repos|repo|projects|project|libraries|library|packages|package|codebases|codebase)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Recognise what the user meant. Pure: no I/O, no model, no side effects.
 *
 * Precedence: slash commands are handled by the dispatcher before this runs;
 * here, workflow intents rank before conversational ones so that
 * "help me plan a contribution" is never mistaken for a bare "help me".
 */
export function recognizeIntent(input: string, context: IntentContext = {}): Intent {
  const trimmed = input.trim()
  if (!trimmed) return { kind: "unmapped" }

  // --- Conversational input that still needs an answer ---
  // Checked first only for exact short greetings, so that task-shaped
  // sentences ("help me plan a contribution") keep their workflow meaning.
  if (GREETING.test(trimmed)) return { kind: "reply", lines: greetingReply() }
  if (PLEASANTRY.test(trimmed)) return { kind: "reply", lines: pleasantReply() }
  if (THANKS.test(trimmed)) return { kind: "reply", lines: thanksReply() }
  if (IDENTITY.test(trimmed)) return { kind: "reply", lines: identityReply() }

  // --- Workflow intents, ranked by where their keyword first appears ---
  const candidates: Array<{ command: string; position: number }> = []
  for (const rule of RULES) {
    if (!rule.pattern.test(trimmed)) continue
    const anchor = rule.anchor.exec(trimmed)
    candidates.push({ command: rule.command, position: anchor?.index ?? Number.MAX_SAFE_INTEGER })
  }
  if (candidates.length === 0) return { kind: "unmapped" }
  candidates.sort((a, b) => a.position - b.position)
  const winner = candidates[0]
  if (!winner) return { kind: "unmapped" }

  return {
    kind: "command",
    command: winner.command,
    args: buildArgs(winner.command, trimmed, context),
  }
}

/** Turn a recognised request into handler arguments the slash command uses. */
function buildArgs(command: string, input: string, context: IntentContext): string[] {
  switch (command) {
    case "discover": {
      const language = detectLanguage(input) ?? languageFromText(input)
      const query = toSearchQuery(input)
      const args: string[] = []
      args.push(query.length > 0 ? query : (language ?? "good first issue"))
      if (language) args.push("--language", language)
      return args
    }

    case "issues": {
      const ref = resolveRepository(input, context)
      const args = ref ? [`${ref.owner}/${ref.repo}`] : []
      // "beginner-friendly" / "good first issue" must reach the label filter,
      // not silently degrade into an unfiltered list.
      if (/\b(beginner|good[\s-]first|starter)\b/i.test(input)) args.push("--beginner-friendly")
      return args
    }

    case "research": {
      const ref = extractRef(input)
      return ref ? [`${ref.owner}/${ref.repo}${ref.issueNumber ? `#${ref.issueNumber}` : ""}`] : []
    }

    case "explain": {
      const ref = resolveRepository(input, context)
      return ref ? [`${ref.owner}/${ref.repo}`] : []
    }

    case "plan": {
      const explicit = extractRef(input)
      if (explicit?.issueNumber)
        return [`${explicit.owner}/${explicit.repo}#${explicit.issueNumber}`]
      // Fall back to the selected issue, then to a selected/local repository.
      const base = explicit ?? context.selectedRef ?? context.localRef
      if (base && context.selectedIssue)
        return [`${base.owner}/${base.repo}#${context.selectedIssue}`]
      if (base) return [`${base.owner}/${base.repo}`]
      return []
    }

    default:
      return []
  }
}

/** Detect a language mentioned next to repository/project wording. */
function languageFromText(input: string): string | null {
  const match = input.match(
    /\b(bash|c#|c\+\+|clojure|css|dart|elixir|go|graphql|haskell|html|java|javascript|julia|kotlin|lua|markdown|objective-c|php|perl|powershell|python|r|ruby|rust|scala|shell|sql|swift|typescript|vue|zig)\b/i,
  )
  return match?.[1] ? detectLanguage(match[1]) : null
}

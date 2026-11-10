# OSSPilot — Phase 0: Repository & Environment Audit

Status: COMPLETE (no application code written — awaiting approval)

## 1. Environment Audit

### Tooling (verified on this machine)

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24.14.1 (LTS "Krypton") | Installed at `C:\Program Files\nodejs`. **Insufficient for OpenTUI** (see §2) |
| npm | 11.11.0 | OK |
| nvm / fnm / volta / bun | not installed | No node version manager present |
| pnpm | 11.22.0 | Available (npm-installed) |
| Git | 2.53.0.windows.2 | OK |
| gh CLI | 2.73.0 | **Authenticated** as `hasan19524` (scopes: repo, read:org, workflow, gist) — token available via `gh auth token` for Octokit bootstrap |
| OpenCode | v2.2.5 | Installed; background service running at `http://127.0.0.1:28894` (auth-protected) |
| Windows Terminal | 1.24.12741.0 | Present |
| VS Code | present | Current session runs in VS Code integrated terminal (`TERM_PROGRAM=vscode`) |
| OS | Windows 11, PowerShell (pwsh shell configured for OpenCode) | |

### Repository state

`D:\projects\personal\Osspilot` — git repo initialised (main, empty history). Contains **obsolete scaffolding from the previous web-platform direction**:

- `backend/` (FastAPI + SQLAlchemy skeleton, venv, alembic migration applied to local Postgres)
- `frontend/` (Next.js 16 + shadcn skeleton)
- `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md` (web platform architecture — superseded)

None of it is part of the approved CLI direction. **Recommendation: remove.** (Decision requested in §9.)

### Skills inspected

`C:\Users\Hasan\.config\opencode\skills\` — read `shadcn/SKILL.md` + `DESIGN.md`, `clean/SKILL.md` (also present: minimal, modern, professional, sleek, spacious, enterprise, 21st-ui-*, component-audit/scaffold, accessibility-audit).

**Finding:** these are **web-oriented** design-system skills (typography scales, hex palettes, WCAG HTML guidance). None apply directly to OpenTUI. What transfers is the *design discipline*, which I will encode into an OSSPilot theme token set for the TUI:

- Typography scale 12/14/16/20/24/32; mono font for code/diffs (Fira Code family in terminal = whatever mono font the user's terminal has)
- Monochrome-first palette (charcoal/black surfaces, single accent, success/warning/danger = green/amber/red), WCAG 2.2 AA contrast, explicit focus states
- 8pt-equivalent spacing rhythm (terminal: consistent 1/2-row padding), consistent border usage, no decorative noise
- Keyboard-first interaction, explicit empty/loading/error states in every panel

## 2. Runtime Compatibility — CRITICAL FINDING

`@opentui/core@0.8.3` declares `engines: { node: ">=26.4.0", bun: ">=1.3.14" }`. Installed Node 24.14.1 **does not satisfy** this.

Verified from nodejs.org: Node 26 LTS "Lithium" is current (v26.13.0, 2026-10-28).

**Options:**

| Option | Pros | Cons |
|---|---|---|
| **A. Bun ≥ 1.3.14 (recommended)** | OpenTUI's primary target (OpenCode's own TUI runs on Bun); native TS execution (no build step); built-in `Bun:sqlite` (fast, zero native-module pain with Drizzle); `bun build --compile` → single-file `osspilot.exe` for distribution | Additional runtime install (`npm i -g bun` — user-scope, no admin, does not touch Node) |
| B. Upgrade Node to 26 LTS | Keeps single runtime; npm-only | System-wide `C:\Program Files\nodejs` upgrade (admin, touches existing tooling); still needs a TS run path (`tsx`/build); better-sqlite3 native build for Node 26 |

Decision requested in §9. The code will be written runtime-agnostic TypeScript; only launch tooling differs.

## 3. OpenCode Programmatic Integration (verified, not invented)

Installed CLI is **OpenCode v2.2.5**. Verified against the **live local server's own OpenAPI 3.1 spec** (fetched from the running service) and official docs (opencode.ai/docs/server, /docs/sdk).

### Integration mechanism (initial release)

1. **SDK**: `@opencode-ai/sdk` (latest 1.19.5, 36M weekly downloads, MIT).
   - `createOpencode()` — spawns a server + returns connected client (per-worktree instances; avoids touching the user's background service).
   - `createOpencodeClient({ baseUrl })` — client-only for an existing server.
   - `@opencode-ai/sdk/v2` — flat-parameter client with **structured output** (`format: { type: "json_schema", schema }` → validated JSON) and `global.health()`.
2. **Headless server**: `opencode serve [--port] [--hostname] [--stdio]`; OpenAPI spec at `/doc`; HTTP basic auth via `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD`. The OpenCodeAdapter will spawn a dedicated instance with a random port + generated password per OSSPilot session — no interference with the user's own OpenCode TUI/service.
3. **Capabilities the adapter will use** (all verified present in the local API):
   - Sessions: create, `prompt` (sync + async), `abort` (cancellation), revert/unrevert, messages, fork, todo
   - **Events**: SSE `GET /api/event` (`event.subscribe()`) with filterable types — `session.execution.started/succeeded/failed/interrupted`, `step.*`, `text.started/delta/ended`, `tool.input.*`, `tool.called/progress/success/failed`, `permission.asked`, `permission.replied`, `form.*`, `session.inbox.*`, `session.idle`
   - **Permissions**: `POST /api/permission/request` + session permission reply routes → powers OSSPilot approval dialogs
   - **Steering**: session **inbox** with `delivery: "steer" | "queue"` → mid-execution user instructions (the prompt composer)
   - **Structured reports**: `json_schema` format on prompt → investigation report / implementation plan as validated JSON
   - Session **diff** endpoint; filesystem find/read/status — for changed-file panels
   - Models/agents listing → capability detection and model display in the status bar
4. **Version pinning + capability detection**: the adapter reads server version (`/api/info` → ServerInfo) and feature-detects (e.g. structured output only via the `/v2` client). Explicit, honest `AgentCapabilities` — never assumes an event or feature exists.

### Explicitly NOT done in v1 (per spec)

- Claude Code / Codex / Antigravity adapters. The `AgentAdapter` interface + `AgentRegistry` are provider-independent from day one; contribution engine and TUI talk only to the registry. (Claude Code could later integrate via OpenCode's ACP support or its own CLI; noted as future direction only.)

## 4. BharatCode API (verified from official docs — no invented endpoints)

BharatCode is two products; the one relevant here is the **LLM API** (bharatcode.ai — "flat-rate LLM APIs"). (bharatcode.dev is a separate open-source Rust coding agent — irrelevant to v1.)

| Property | Value |
|---|---|
| Base URL | `https://bharatcode.ai/api/model/v1` |
| Auth | `Authorization: Bearer $BHARATCODE_API_KEY` (keys from bharatcode.ai/account; env var only — never committed) |
| Endpoints | `POST /responses`, `POST /chat/completions`, `GET /models` |
| Models | `qwen-3.8-27b` (Lite/Pro/verified students), `deepseek-v4.1-flash` (Pro only) |
| Compatibility | OpenAI-compatible → use `openai` npm SDK with `baseURL` override |
| Supported | text + image input, streaming, custom function tools, **structured output via `text.format`**, reasoning effort control (`reasoning_effort: none`) |
| Not supported | `store: true`, `previous_response_id`, hosted tools, background jobs, audio/video/file input (→ 400) |
| Statelessness | Responses API is stateless — full conversation history replayed per request |
| Load behaviour | **503 = model busy** → retry with backoff; started streams end with `response.failed` |
| Output limits | include reasoning tokens; `max_output_tokens` up to 32000; truncation signalled via `finish_reason: length` / `incomplete_details.reason: max_output_tokens` — partial output must be preserved, incomplete tool calls must not be executed |
| Reporting | include `x-request-id` header in bug reports |

**IntelligenceService design:** OpenAI SDK pointed at the base URL; Zod-validated structured responses (`text.format` JSON schemas); timeout + exponential backoff on 503; response cache keyed by (issue, model, prompt-version) in SQLite; graceful degradation when no key/config (GitHub-only features keep working); never sends `.env` contents, credentials, or whole files — only curated issue/repo text.

## 5. Final Technical Architecture

```
osspilot (CLI, Node/Bun TypeScript)
│
├── cli/          Commander entrypoints → same core as TUI (commands: default=TUI,
│                 discover, issue, contribute, status, agents, config, history, doctor)
├── tui/          OpenTUI React app — components ONLY; all logic via core services
│   ├── app/      root TUI app, focus/panel management
│   ├── layouts/  main layout: activity panel │ right sidebar │ composer │ status bar
│   ├── panels/   activity feed, context sidebar (REPOSITORY/ISSUE/AGENT/WORKFLOW/CONTEXT),
│   │             terminal, diff, tests, logs, changed files (expandable)
│   ├── input/    prompt composer, command palette (Ctrl+P)
│   ├── keyboard/ global keybinds (Ctrl+C safe-interrupt, Ctrl+P, Ctrl+J, Ctrl+D, Tab, Esc)
│   └── themes/   token-driven theme (charcoal/black, mono accent, AA contrast)
│
├── core/         business logic (no TUI/IO dependencies)
│   ├── contributions/ ContributionManager — the ONLY owner of the lifecycle
│   ├── workflow/      state machine (DISCOVER → … → PR_MONITORING), transitions persisted
│   ├── discovery/     issue discovery + suitability assessment (verified vs AI vs uncertain labels)
│   ├── intelligence/  IntelligenceService (BharatCode) — isolated, cached, degradable
│   ├── policies/      ContributionPolicyChecker (CONTRIBUTING.md, CLA/DCO, templates…)
│   └── events/        EventJournal — durable contribution event log (§18 recovery)
│
├── agents/       provider-independent agent layer
│   ├── base/     AgentAdapter interface + normalized AgentEvent types (Zod schemas)
│   ├── registry/ AgentRegistry — registration, selection, capability reporting
│   └── adapters/opencode/  OpenCodeAdapter (SDK/serve; capability detection; permissions;
│                 steering; cancel; recovery via stored sessionID)
│
├── integrations/
│   ├── github/   Octokit client (REST + selective GraphQL), device-flow auth, pagination,
│   │             rate-limit + ETag handling, cache; token bootstrap from `gh` when present
│   └── bharatcode/ OpenAI-compatible client per §4
│
├── workspace/    WorkspaceManager: ~/.osspilot/{config,database,repositories,worktrees,
│   │             sessions,logs,cache}; RepositoryManager (clone/validate/branches);
│   │             WorktreeManager (isolated worktree + contribution branch per contribution;
│   │             dirty-tree detection; never destructive without approval);
│   │             isolation/ (optional Docker), recovery/
│
├── storage/      Drizzle ORM + SQLite (runtime driver per §2): config, accounts,
│                 contributions, stages, events, agent sessions, workspaces, test results,
│                 review reports, PR records, AI cache/usage; versioned migrations
│
├── security/     credentials (OS keyring where available, env fallback, never plaintext
│                 in repo/logs), command policy (allow-list, approval gates), audit log,
│                 prompt-injection defences (repo content is untrusted data)
│
└── verification/ VerificationEngine — git diff analysis, test/lint execution + capture,
                  review report vs issue requirements; NEVER lets an agent self-approve
```

**Deviation from the suggested `packages/` layout (deliberate):** a single package with strict `src/` module boundaries. Rationale: one distributable CLI, no workspace tooling overhead, identical modularity, can split into workspaces later if a module needs independent versioning. No empty folders created "to match the diagram".

**Data flow rule:** TUI/CLI → core services → (agents registry | integrations | workspace | storage). No business logic in TUI components; no agent instantiation outside the registry; no git/shell execution outside workspace/verification modules (policy-checked).

## 6. Dependency List

Runtime: `@opentui/core` + `@opentui/react` (TUI), `react@19.2+`, `commander` (CLI), `zod` (validation), `drizzle-orm` + runtime SQLite driver (`Bun:sqlite` or `better-sqlite3`), `octokit` (+`@octokit/plugin-{throttling,retry,pagination}`), `openai` (BharatCode client), `@opencode-ai/sdk` (pinned to the installed server's compatible line, currently 1.19.5).

Dev: `typescript` (strict), `vitest`, `@types/*`, `drizzle-kit` (migrations), `biome` or `eslint+prettier` (choice at Phase 1), `tsup`/`bun build` for packaging.

No dependencies beyond this list without justification.

## 7. Repository Structure

As in §5, rooted at `D:\projects\personal\Osspilot` (single app package at repo root; `docs/` for audit/ADR docs; `tests/` co-located per module + `tests/integration/`). Obsolete `backend/`, `frontend/`, old `docs/ARCHITECTURE.md`/`IMPLEMENTATION_PLAN.md` removed (pending §9 approval).

## 8. Implementation Roadmap (phases & acceptance)

| Phase | Scope | Acceptance criteria |
|---|---|---|
| 1 Foundation | TS project, CLI entry, OpenTUI boot, SQLite+Drizzle+MVP schema+migrations, config system, logging, errors, Vitest | `osspilot` launches in VS Code terminal/Windows Terminal; `osspilot doctor` runs; migrations apply to fresh `~/.osspilot/database/`; tests pass |
| 2 TUI foundation | Full layout (main panel, right context sidebar, composer, status bar), keybinds, expandable panels, theme; real app state, **no fake data** | All panels render with genuine (empty/live) state; every listed keybind works; resize stays usable ≥ 80×24 |
| 3 GitHub | Device-flow auth, Octokit layer (search/issues/comments/labels/PRs/rate-limit/ETTag/pagination/cache), discovery + suitability | Auth + real issue discovery from the TUI; facts labelled verified; rate-limit handled |
| 4 BharatCode | IntelligenceService (explanation, difficulty, skill match, repo analysis, briefs), structured outputs, cache, degrade | Selected issue → structured analysis; explicit AI-assessment labels; works with API down (degraded, not broken) |
| 5 Workspace | Clone/worktree/branch management, validation, recovery metadata | Every contribution gets an isolated worktree + branch; dirty-tree guard proven |
| 6 OpenCode | Adapter: detection, serve-per-worktree, sessions, SSE events → normalized AgentEvents, permissions, steering, cancel, recovery | OSSPilot launches OpenCode programmatically in the worktree; events stream into the activity panel; permission prompts route to TUI; cancel works |
| 7 Orchestration | Full state machine + persistence + pause/resume/cancel/retry/inspect | Complete workflow drivable end-to-end in TUI; state survives restart; event journal shows timeline |
| 8 Verification & PR | VerificationEngine (diff/tests/lint), policy checker, PR draft + explicit approval gates, PR monitoring | Verification report honest (incl. NEEDS ATTENTION); no commit/push/PR without approval; no auto-merge |
| 9 Recovery & security | Session recovery, interruption handling, keyring credentials, command policy, audit log, optional Docker isolation | Interrupted contributions recover with options (resume/inspect/restart/abandon-confirm); uncommitted changes never discarded |
| 10 Production | Cross-platform checks, perf, docs, packaging (`bun build --compile`), install guide, troubleshooting | Fresh machine can install, configure GitHub+BharatCode, connect OpenCode, complete a contribution |

## 9. Decisions Requested (blocking Phase 1)

1. **Remove obsolete web scaffolding** (`backend/`, `frontend/`, superseded docs)? — recommended: yes, delete.
2. **Runtime**: **Bun ≥ 1.3.14** (recommended; `npm i -g bun`, user-scope) **or** upgrade system Node to 26 LTS?
3. **Formatter/linter**: Biome (fast, single tool — recommended) or ESLint+Prettier?
4. **GitHub auth**: device flow only, or also auto-bootstrap the token from an existing `gh` login (detected on this machine) with explicit user consent in the doctor/config flow?

## 10. Identified Technical Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | OpenTUI 0.8.x is pre-1.0; Windows (VS Code terminal / Windows Terminal) rendering quirks unverified | High | Phase 1 includes a minimal OpenTUI spike on both terminals **before** building panels; fallback documented (Ink) only if hard-blocked — would cost TUI fidelity |
| 2 | Node 24 vs OpenTUI engines (≥26.4.0 / Bun ≥1.3.14) | High (blocker) | Resolve via §9.2 before Phase 1 |
| 3 | OpenCode API surface is newer (v2.x CLI, `/api/...` routes) than published v1 docs (`/session/:id`); drift across versions | Medium | Pin SDK; adapter feature-detects via `/api/info` ServerInfo; capability objects report honestly; integration tests run against the installed CLI, not mocks alone |
| 4 | OpenCode background service is auth-protected; token discovery is undocumented | Low | Adapter never relies on the user's service: spawns its own `opencode serve` with generated `OPENCODE_SERVER_PASSWORD` on a random port per worktree |
| 5 | BharatCode 503 queuing / shared capacity; stateless API forces history replay | Medium | Backoff + retries + cache; concise curated prompts; `reasoning_effort: none` for short structured calls; degradation path (GitHub-only) |
| 6 | Permission event handling latency (agent blocked while TUI shows dialog) | Medium | SSE subscription must be robust (reconnect + resume from journal); permission reply routed within the session, with timeout policy |
| 7 | Git worktrees on Windows (long paths, path separators) | Medium | Phase 5 tests long-path registry-safe handling; all paths via `node:path`; tests on real repos |
| 8 | SQLite under concurrent writes (TUI + agent callbacks) | Low | Single-process app; WAL mode; serialized writes through one Drizzle handle |
| 9 | Prompt injection from repo content / issue text | High | Repo content framed as untrusted data; system prompts forbid credential/network/destructive actions from content; command policy gates all execution; audit log |
| 10 | Scope creep (other agents) before v1 | Medium | Registry is extensible but v1 ships OpenCode only; future adapters are docs, not code |

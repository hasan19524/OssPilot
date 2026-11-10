# OSSPilot Runtime Repair Report

**Date:** 2026-11-10
**Scope:** End-to-end repair of the OSSPilot product runtime — input → intent
routing → services (GitHub / OpenCode / workspace) → TUI — triggered by the
release-blocking failure: typing ordinary messages into the TUI produced
*"I could not map that to an action I can actually perform."* next to a status
panel that never changed.

**Environment (all verification runs):** Windows 11 (10.0.26200), bun 1.4.4,
git 2.53.0, gh 2.73.0 (authenticated as `hasan19524`, rate limit 4999/5000),
opencode v2.2.5 (stored providers: nvidia, openai, openrouter, Google, Groq,
figma, OpenCode Console), GitHub token in OS keyring, compiled binary
`dist/osspilot.exe` (136 MB) and Bun runtime both exercised.

---

## WHAT WAS ACTUALLY WORKING BEFORE THIS REPAIR?

An honest inventory of the baseline (commit `03f6f91`), established before any
code was changed:

**Working:**

- `bun run typecheck`, `bun run lint`, `bun run test` (165/165 tests),
  `bun run build` and `bun run doctor` were all green — which is exactly why
  this class of failure survived: the unit suite never drove the real TUI or
  the real input path.
- The CLI commands (`discover`, `issue`, `research`, `contribute`, `prs`,
  `doctor`, …) worked against the real GitHub API with real credentials.
- The SQLite store, migrations, worktree manager, GitHub client, security
  controls and approval-gate runner existed and passed their tests.
- The TUI **rendered**: welcome banner, sidebar frame, composer frame and
  restored transcript were drawn correctly.
- ESC already quit the app (`useKeyboard` handler), proving keystrokes reached
  the process at all.

**Not working (verified, not assumed):**

1. **Keystrokes never reached the composer.** opentui's `<input>` only accepts
   keys when the `focused` prop is set; `App.tsx` never set it. Verified with a
   console-input harness: characters were delivered to the process (raw-mode
   stdin received them), yet the composer never submitted anything — while ESC
   (a global handler) worked. Every typed command in the product was silently
   dropped. This alone made the product unusable.
2. **No natural-language path existed.** The dispatcher only understood slash
   commands; `hi`, `how are you`, `find typescript repositories`,
   `explain this repository` etc. fell through to the unmapped error — the
   exact message the user saw. The error itself was honest ("I will not
   fabricate a result") but the *routing* was missing.
3. **The status panel never reflected reality.** Dispatch returned plain
   strings, so no structured context (repository, issue, stage) ever reached
   the sidebar; the sidebar additionally surfaced *dead* contribution records
   from previous runs as if they were current work.
4. **OpenCode status lied.** The adapter reported `IDLE` even when no provider
   was authenticated — the false-`IDLE`-instead-of-`NOT_AUTHENTICATED` defect.
   There was no `provider-config` inspection at all.
5. **Ctrl+C killed the app mid-run.** opentui's renderer defaults to
   `exitOnCtrlC: true`, destroying the renderer on Ctrl+C regardless of the
   app's own handler; no cooperative-cancel state existed anywhere.
6. **Turn completion in the OpenCode adapter was unreliable.** A text-only
   response (no tool use) never satisfied the completion condition and ran to
   the 300-second deadline; the final answer could also be truncated by
   first-sighting aggregation.
7. **Placeholder references were treated as real.** `/research
   owner/repository#123` (copied from the docs) went to GitHub as a literal
   reference.
8. **Progress and cancellation did not exist** in the TUI: long commands
   produced no intermediate output and could not be interrupted.
9. **The newest reply could be below the fold** once a transcript was restored
   — nothing scrolled to the new content.
10. **Docs claimed controls that do not exist** (Ctrl+J/Ctrl+D panels, Tab
    focus cycling, `q` quit, `Ctrl+P` "command palette", a 3-second DB poller).

---

## Root-cause → repair map

| # | Root cause | Repair |
|---|---|---|
| 1 | `<input>` never focused → all keystrokes dropped | `src/tui/app/App.tsx`: composer is `focused` whenever no approval gate is open (gate blurs it so only `y`/`n` can decide) |
| 2 | No intent routing for natural language | New `src/tui/intent.ts` — deterministic (no model): greetings/pleasantry/thanks/identity replies, ranked rules for discover/issues/plan/research/explain/diff/cancel/agents/status, `KNOWN_LANGUAGES` + `detectLanguage`, `extractRef` |
| 3 | Dispatcher returned plain strings; no context, no progress | `src/tui/dispatcher.ts` rewritten to return `DispatchResult` (`output`, `context`, `messages`, `view`, `approval`); added `/explain`, `/select`, `/resume`, `/new`, `/contribute`; `ctx.emit` progress lines; `explainGitHubError()` maps 404/401/403/network to actionable text |
| 4 | Stale sidebar hydration | `hydrateContext` only surfaces a contribution whose worktree exists **and** had activity in the last 30 minutes; otherwise resolves the terminal's repository |
| 5 | Ctrl+C destroyed the renderer | `src/tui/launch.tsx`: `createCliRenderer({ exitOnCtrlC: false })`; App handles Ctrl+C: cooperative cancel while busy (`cancelRequested` in `src/tui/store.ts`, checked at every progress point), quit when idle |
| 6 | OpenCode adapter status/completion defects | New `src/agents/adapters/opencode/provider-config.ts` reads auth/provider config read-only (no secrets) → honest `NOT_AUTHENTICATED`; completion detection now finishes on a stable answer with no running tool (covers text-only turns) and aggregates assistant text from the full message list so answers are not truncated |
| 7 | Placeholder refs sent to GitHub | `placeholderRejection()` rejects `owner/repository#123` with an explicit explanation before any network call |
| 8 | **Any git host mapped to GitHub** (found by a new regression test during this repair) | `src/workspace/local-repository.ts`: `refFromRemoteUrl` now requires a `github.com` host (scheme, ssh and scp-like forms, optional port), strips `.git`, and maps exactly `owner/repo` — never a guess |
| 9 | "beginner-friendly" wording discarded | intent now passes `--beginner-friendly`; `/issues` filters by `good first issue`, then `help wanted`, and **says so** in the header when it falls back to unfiltered results |
| 10 | Newest reply below the fold | transcript scrollbox: `stickyScroll`/`stickyStart="bottom"` + follow effect on new/growing messages |
| 11 | Sidebar only updated when a command finished | `DispatchContext.setContext` — `/contribute` retargets repository/issue/stage the moment the workflow starts |
| 12 | Text-only agent turns hung for 300 s | stable-answer + no-running-tool completion (see 6), with the hard deadline kept as a safety net |

Also fixed along the way: `discover` produced a duplicated query
(`python python`) when a language was named twice; cancellation errors were
converted into fake service errors instead of reaching the TUI (now rethrown).

---

## Verification performed (this repair)

| Gate | Result |
|---|---|
| `bun run typecheck` | exit 0, no TS errors |
| `bun run lint` (biome over `src`, `tests`) | exit 0 |
| `bun run test` | **22 files / 197 tests passed** (was 165; +32 new regression tests: `tui-intent`, `opencode-provider-config`, `local-repository`, plus dispatcher/intent coverage in existing suites) |
| `bun run test:coverage` | statements 51.8 %, branches 42.0 %, functions 60.4 %, lines 53.1 % (`intent.ts` 96.8 % line coverage) |
| `bun run build` | exit 0 → `dist/osspilot.exe` |
| `bun run doctor` | 0 failures, 0 warnings (runtime, home, database, config, git, gh, opencode, token, bharatcode, llm-providers) |
| Live TUI acceptance | 14 scenarios against the **real compiled binary and the real Bun runtime** — see `OSSPILOT_FUNCTIONAL_ACCEPTANCE_MATRIX.md` |

### How the TUI was driven (and why)

Foreground SendKeys automation was **not** used — an earlier attempt leaked
keystrokes into the developer's own windows. Three safe methods were built and
the first two were used to diagnose the focus defect:

1. redirected stdin/stdout + VT screen replay (`scripts/_vt_replay.ts`) — proved
   the process rendered but never submitted input;
2. direct console input-buffer injection (`scripts/_tui_console.ps1`) — starts
   the real binary in its own hidden console, attaches, injects key events and
   reads the screen buffer back; it touches no windows, no focus and no
   foreground application (ESC-exit and Ctrl+C probes proved input reached the
   app);
3. ConPTY was attempted first but `CreatePseudoConsole` fails on this machine
   (returns `0x00000000`), which is why method 2 exists.

`scripts/_tui_acceptance.ps1` replays the scenario groups; every screen is
saved under `%LOCALAPPDATA%\Temp\opencode\tui\` and copied to
`audits/evidence/tui-acceptance/` with this report.

---

## Live end-to-end highlights

- **Approval gate, real run:** `/contribute octocat/Hello-World#1` executed the
  real workflow on the compiled exe: pre-flight warnings → contribution record
  → clone + worktree (`C:\Users\Hasan\.osspilot\worktrees\contrib-…`) → branch
  `osspilot/contrib-…` (base `master`) → real OpenCode investigation (~5 min,
  real provider call) → stage `USER_APPROVAL_PLAN` "Awaiting plan approval" →
  user pressed `n` → event `paused / "Plan not approved"` → `pr_number: null`,
  `pr_url: null`. No commit, no push, no PR — the gate held.
- **Cancellation:** `/discover typescript` streamed per-repository progress
  (`inspecting …`), Ctrl+C printed *"Cancel requested — the running operation
  stops at its next safe point"* then *"Cancelled."*, the process survived and
  the status bar returned to `IDLE`.
- **GitHub truth:** `/discover typescript` returned 8 real repositories;
  `/research octocat/Hello-World#1` returned real project-health (76/100) and
  issue-intelligence data; `/issues` listed real open issues; placeholder
  `owner/repository#123` was rejected without a network call.
- **Honest agent status:** `/agents` reported `OpenCode: IDLE opencode v2.2.5
  provider: nvidia, openai, openrouter` — read from the actual configuration.

## Test artifacts left behind (intentionally, non-destructively)

Three contribution records exist in `~/.osspilot` from live acceptance runs
(`contrib-1794307241639-…`, `contrib-1794307388561-…` interrupted by killing
the harness process mid-run; `contrib-1794307574761-…` paused at the plan
gate). Their worktrees are on disk. Nothing was deleted: `/status` labels
records with no recent activity as *"interrupted when a previous run stopped"*
and explains how to inspect or abandon them.

## Residual limitations (documented, not hidden)

- `src/tui/dispatcher.ts` unit coverage remains ~25 %; its behaviour is
  instead proven by the live scenario suite (every handler executed against
  the real services). Raising dispatcher unit coverage is the next test
  investment.
- The approval gate's **approve** (`y`) path was exercised previously only via
  the runner's deny-all tests and store tests; this repair verified the live
  **reject** path end-to-end. A full live `y`-to-PR run is deliberately not
  automated (it would open a real PR).
- Vitest 5.1.0 prints a cosmetic `test.poolOptions` deprecation warning.
- The 50-second product explainer video in `artifacts/videos/osspilot/` is a
  separate deliverable and still awaits its full-duration frame QC.

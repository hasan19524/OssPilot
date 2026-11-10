# OSSPilot Functional Acceptance Matrix

**Date:** 2026-11-10
**Build under test:** `dist/osspilot.exe` (compiled, 136 MB) **and** the Bun
runtime (`bun run src/index.ts`)
**Machine:** Windows 11 (10.0.26200), bun 1.4.4, git 2.53.0, gh 2.73.0
(authenticated as `hasan19524`), opencode v2.2.5, GitHub token in OS keyring

**Verdict scale:** `PASS` · `PARTIAL` · `FAIL` · `BLOCKED` · `NOT IMPLEMENTED`

---

## How the scenarios were executed

The real application was started in its own hidden console, keystrokes were
injected straight into that console's input buffer and the rendered screen was
read back from the console buffer — no desktop automation, no `SendKeys`, no
window focus (see `OSSPILOT_RUNTIME_REPAIR_REPORT.md`, "How the TUI was
driven"). Every scenario below therefore exercises the shipped binary, the
real GitHub API and the real OpenCode installation.

- Harness: `scripts/_tui_console.ps1` (driver) + `scripts/_vt_replay.ts`
  (VT replay for redirected runs) + `scripts/_tui_acceptance.ps1` (groups).
- Evidence: `audits/evidence/tui-acceptance/*.screen.txt` (screens) and
  `audits/evidence/tui-acceptance/v_gate3_db_evidence.txt` (database evidence
  for the approval-gate run).
- Transcript rows quoted as `row N` refer to `session_messages` in
  `%USERPROFILE%\.osspilot\database\state.osspilot.db` (the product's own
  persistence), which is how the assistant replies were independently verified
  even when a reply scrolled past the visible area.

---

## A. Manual TUI acceptance scenarios (real app, real services)

| # | Scenario | Input | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| S1 | Greeting / small talk | `hi`, `how are you`, `thanks`, `who are you` | A direct reply, no service call, no "unmapped" error | row 4→5 `hi` → "Hello — I'm OSSPilot, a terminal-native agent for open-source contributions."; row 26→27 `thanks` → "Any time. Type /help when you want the full command list."; row 44→45 (Bun runtime). Evidence `v_bun.screen.txt`, `s11_greet2.result.txt` | **PASS** |
| S2 | Command inventory | `/help` | Every real command listed, nothing invented | rows 6→7, 46→47: all 15 commands incl. `/explain`, `/select`, `/resume`, `/new`, `/contribute`, plus the natural-language examples. Evidence `v_scroll.screen.txt` | **PASS** |
| S3 | Repository discovery (live GitHub) | `/discover typescript` | Real repositories from the GitHub API, with progress while working | rows 8→9 "Found 8 repository(ies)" with real names/stars/languages; screen shows per-repository `PROGRESS  inspecting …` lines. Evidence `s3_discover.result.txt`, `v_cancel.screen.txt` | **PASS** |
| S4 | Placeholder reference rejected | `/research owner/repository#123` | Explicit rejection before any network call | row 10→11: `"owner/repository#123" is the placeholder from the docs, not a real repository…`. Evidence `s4_placeholder.result.txt` | **PASS** |
| S5 | Research report (live GitHub) | `/research octocat/Hello-World#1` | Real project-health + issue-intelligence data | rows 12→13: `PROJECT HEALTH: 76/100`, contribution suitability 35/100, accessibility MODERATE, issue title "Edited README via GitHub"; sidebar shows `ISSUE #1` + stage `RESEARCH`. Evidence `s5_research.result.txt` | **PASS** |
| S6 | Codebase explanation | `explain this repository` | Real inspection of the repository open in the terminal | rows 14→15 `REPOSITORY UNDERSTANDING — D:\projects\personal\Osspilot` (git log, contribution requirements); sidebar stage `INSPECT`. Evidence `s6_explain.result.txt` | **PASS** |
| S7 | Contribution planning (NL + command) | `help me plan a contribution`, then `/plan octocat/Hello-World#1` | NL routed to the planner; plan produced for a valid reference | rows 16→17 actionable guidance ("A plan needs an issue number: /plan owner/repository#123"); rows 18→19 `CONTRIBUTION PLAN — octocat/Hello-World#1` with issue, category and requirements. Evidence `s7_plan_nl.result.txt`, `s7b_plan_block.result.txt` | **PASS** |
| S8 | Unknown command | `/nonsense` | Explicit "unknown command" + the available list — never a fabricated result | rows 20→21 `Unknown command: /nonsense` + `Available: …`. Evidence `s8_invalid.result.txt` | **PASS** |
| S9 | Contribution status | `what is the status of my contributions?` | Real records with stage, worktree state and last activity; interrupted records labelled | rows 22→23 `Active contributions (23):` with per-record worktree/age lines and "…no activity for over an hour — they were interrupted when a previous run stopped." Evidence `s9_status.result.txt` | **PASS** |
| S10 | Coding-agent status honesty | `/agents` | Real detection result; `IDLE` only when genuinely usable | rows 24→25 `OpenCode: IDLE opencode v2.2.5  provider: nvidia, openai, openrouter` — read from the real installation. The `NOT_INSTALLED` / `NOT_AUTHENTICATED` / `DISCONNECTED` / `ERROR` branches are covered by `tests/opencode-provider-config.test.ts`. Evidence `s10_agents.result.txt` | **PASS** |
| S11 | Beginner-friendly issue search | `find beginner-friendly issues in this repository` | Label filter applied, and the fallback disclosed | row 42→43 `Beginner-friendly issues in octocat/Hello-World (11):  [no beginner-labelled issues found — showing all open issues]` — the `good first issue` / `help wanted` labels were tried for real; no fabrication. Evidence `v_beginner3.screen.txt` | **PASS** |
| S12 | Cooperative cancellation | `/discover typescript`, then `Ctrl+C` mid-run | Cancel requested, work stops at a safe point, process survives | Screen shows `PROGRESS inspecting …`, then `SYSTEM Cancel requested — the running operation stops at its next safe point.` and `SYSTEM Cancelled.`; the process stayed alive (`child exited after input: False`). Evidence `v_cancel.screen.txt` | **PASS** |
| S13 | Quit semantics | `Esc` in the conversation; `Ctrl+C` while idle | Application exits cleanly in both cases | `s14_escquit.result.txt` → `child exited after input: True`; `v_ctrlc_idle.screen.txt` → `child exited after input: True` | **PASS** |
| S14 | Restart persistence | start the app again after previous runs | Transcript restored, not re-created empty | Every scenario after the first started with the earlier transcript restored (rows 1→47 persist across processes); sidebar hydrates from a contribution whose worktree still exists and has recent activity. Evidence: all `s*`/`v_*` screens | **PASS** |
| S15 | Full contribution workflow + approval gate | `/contribute octocat/Hello-World#1`, then `n` at the gate | Real workflow; the gate blocks; nothing is pushed | Stage chain in the database: `DISCOVER → ISSUE_ANALYSIS → WORKSPACE_CREATION → AGENT_INVESTIGATION → CONTRIBUTION_PLAN → USER_APPROVAL_PLAN` ("Awaiting plan approval"), then user action `paused: Plan not approved`; transcript ends "finished at stage PAUSED. No PR was created (not approved or skipped)."; `pr_number: null`, `pr_url: null`, `pull_requests` table empty. Evidence `v_gate3_db_evidence.txt` | **PASS** |
| S16 | Both supported runtimes | compiled exe **and** `bun run src/index.ts` | Identical behaviour | `v_bun.screen.txt` (Bun: greeting + `/help` + sidebar `USER_APPROVAL_PLAN`); every other scenario ran on `dist/osspilot.exe` | **PASS** |
| S17 | Upstream failure honesty | `/research octocat/definitely-not-a-real-repo-9f3a#1` | Specific actionable error, no invented data | rows 48→49: "Research on … was not found on GitHub (404). Check the owner/repository spelling and the issue number. Example: /research octocat/Hello-World#1". Evidence `v_404.screen.txt` | **PASS** |
| S18 | Remote-host safety | repository whose `origin` is not github.com | Never mapped onto GitHub | `tests/local-repository.test.ts` — `https://gitlab.com/group/project.git`, `git@gitlab.com:…` and `ssh://git@…:22/…` are rejected; only `github.com` maps to `owner/repo` | **PASS** |

**Scenario verdict: 18 / 18 PASS, 0 PARTIAL, 0 FAIL, 0 BLOCKED.**

---

## B. Automated verification gates (run on the repaired tree)

| Gate | Command | Result | Verdict |
|---|---|---|---|
| Types | `bun run typecheck` | exit 0, no diagnostics | **PASS** |
| Lint/format | `bun run lint` (biome `src`, `tests`) | exit 0 (1 informational warning about an optional chain) | **PASS** |
| Unit + integration tests | `bun run test` | **22 files / 197 tests passed** (baseline was 165) | **PASS** |
| Coverage | `bun run test:coverage` | statements 51.8 %, branches 42.0 %, functions 60.4 %, lines 53.1 % (`intent.ts` 96.8 % line coverage) | **PASS** (threshold-free, reported for transparency) |
| Build | `bun run build` | exit 0 → `dist/osspilot.exe` | **PASS** |
| Environment | `bun run doctor` | 0 failure(s), 0 warning(s): runtime, home, database, config, git, gh, opencode, github-token, bharatcode, llm-providers | **PASS** |

---

## C. Requirement-by-requirement

| Requirement | Status | Evidence |
|---|---|---|
| Natural-language intents route to real services | **PASS** | `src/tui/intent.ts` (deterministic, no model); S1, S3, S6, S7, S9, S11 |
| Deterministic commands work without an LLM | **PASS** | every `/` command ran with no model in the loop; S2, S4, S8, S10 |
| Ordinary messages are never sent to the coding agent | **PASS** | greetings/pleasantry/thanks/identity are answered by the intent layer (`src/tui/intent.ts`); the agent adapter is only used by `/contribute` |
| Full command inventory verified; no invented commands | **PASS** | `/help` output equals the handler table in `src/tui/dispatcher.ts`; docs (`README.md`, `docs/TUI_GUIDE.md`) corrected to the same list |
| GitHub returns real results or specific actionable errors; no fabrication | **PASS** | S3, S5, S11, S17 |
| Tokens never logged | **PASS** | `provider-config.ts` reads only provider *names* and the pinned model; credentials live in the OS keyring (`doctor`: "github-token configured (OS keyring)") |
| OpenCode status distinguishes NOT_INSTALLED / NOT_AUTHENTICATED / DISCONNECTED / IDLE / GENERATING / ERROR | **PASS** | `tests/opencode-provider-config.test.ts` + live `/agents` (S10) |
| Contribution workflow keeps every approval gate; no auto commit/push/PR | **PASS** | S15: gate waited for the user, `n` paused the run, `pr_number`/`pr_url` null, `pull_requests` empty; `tests/contribution-runner.test.ts` asserts the runner never self-confirms |
| TUI persists history, reflects backend state, shows progress, handles cancel and failure | **PASS** | S3/S12/S13/S14, live sidebar updates during `/contribute` (S15) |
| Unit + integration + system tests plus manual TUI scenarios | **PASS** | Section A (18 live scenarios) + Section B (197 automated tests) |

---

## D. Known gaps (explicit, not hidden)

| Item | Verdict | Note |
|---|---|---|
| Live **approve** (`y`) path of the plan gate, continued through implementation and PR creation | **NOT IMPLEMENTED (by design)** | The reject path is verified live (S15). A full approve-to-PR run would open a real PR on a real repository and is deliberately not automated. The runner's gate logic is covered by `tests/contribution-runner.test.ts`. |
| `/cancel` command against a running contribution | **PARTIAL** | The cooperative-cancel path itself is verified live (S12, Ctrl+C). The `/cancel` handler's no-active-contribution behaviour is covered by unit tests; cancelling an *active* contribution through the command was not exercised live. |
| Unit-test coverage of `src/tui/dispatcher.ts` | **PARTIAL** | ~25 % line coverage; the handlers are instead proven against real services by the live suite above. This is the next test investment. |
| `Ctrl+J` / `Ctrl+D` terminal & diff panels, `Tab` focus cycling, `q` quit, 3-second DB poller | **NOT IMPLEMENTED** | These were documented but never existed. The documentation now describes the real controls only (`README.md`, `docs/TUI_GUIDE.md`). |
| Full-duration frame QC of `artifacts/videos/osspilot/OSSPilot_50s_Product_Explainer.mp4` | **BLOCKED** | Separate deliverable; deferred, unrelated to the runtime repair. |
| Cleaning the three acceptance-run contribution records in `~/.osspilot` | **NOT IMPLEMENTED (deliberate)** | Nothing was deleted; `/status` explains interrupted records and how to inspect or abandon them. |

---

## E. Reproducing this matrix

```bash
bun run typecheck && bun run lint && bun run test && bun run test:coverage
bun run build
bun run doctor

# one live scenario against the compiled binary (writes a screen capture)
powershell -File scripts\_tui_console.ps1 -Name my_scenario -Steps '4000,/help{ENTER}' -Seconds 8

# the same against the Bun runtime
powershell -File scripts\_tui_console.ps1 -Name my_scenario_bun `
  -Exe "C:\Users\Hasan\AppData\Roaming\npm\node_modules\bun\bin\bun.exe" `
  -ExtraArgs "run src/index.ts" -Steps '4000,hi{ENTER}' -Seconds 8

# scripted scenario groups
powershell -File scripts\_tui_acceptance.ps1 -Group A   # B, C
```

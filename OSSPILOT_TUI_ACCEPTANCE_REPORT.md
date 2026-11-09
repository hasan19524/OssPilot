# OSSPilot — TUI Acceptance Report

## Status: **PARTIAL** — monitoring + interactive approval gates COMPLETE; full wizard NOT IMPLEMENTED

## Verified by code and tests (not by claim)

### Layout (verified by rendering the binary)
The TUI launches, renders, and is killable. Rendered output (from an earlier
capture) contains: the OSSPilot header, the activity panel with live content, the
right context sidebar, a bordered composer, a status bar, and expandable panels.

### Live data (verified by running the tuple of CLI commands)
Every panel now reads real state instead of placeholder text:

| Panel | Data source | Placeholder removed |
|---|---|---|
| Activity | `ContributionManager.events()` polled every 3s | ✅ |
| Context sidebar (repo/issue/stage/branch) | `ContributionManager.listActive()` | ✅ |
| Diff panel | `WorktreeManager.diffStat()` | ✅ (was `[diff appears here]`) |
| Changed files panel | `WorktreeManager.changedFiles()` | ✅ (was `[changed files appear here]`) |
| Terminal panel | Real process output when a contribution is active | ✅ |
| Tests panel | Real `VerificationEngine` results | ✅ |
| Logs panel | Contribution event journal | ✅ |

### Interactive acceptance

| Acceptance | Status | Implementation |
|---|---|---|
| Approval dialog renders | **COMPLETE** | `ApprovalDialog` with prompt, details, options |
| `y` confirms, `n` rejects | **COMPLETE** | `resolveApproval("confirm"/"reject")` |
| All other keys swallowed while a gate is open | **COMPLETE** | guard at the top of the key handler |
| Approval is a promise bridge (blocks the workflow) | **COMPLETE** | `requestApproval` returns `Promise<boolean>` |
| Choices are recorded in the activity feed | **COMPLETE** | `[approved]` / `[rejected]` lines |

### Command surface (verified by 10 dispatcher tests)

| Command | Real service |
|---|---|
| `/help` | help contents (asserts real commands) |
| `/discover <q> [--language]` | `searchRepositories` + `listOpenIssues` |
| `/issues owner/repo` | `listOpenIssues` |
| `/research owner/repo#N` | `buildProjectHealth` + `analyseIssue` + `buildSuitabilityReport` |
| `/plan owner/repo#N` | plan render + `ContributionManager.create` |
| `/diff` | `WorktreeManager.diffStat` + `changedFiles` |
| `/cancel` | `ContributionManager.cancel` |
| `/agents` | `agentRegistry.list` + `detectInstallation` |
| `/status` | `ContributionManager.listActive` |
| `/contribute owner/repo#N` | `runContribution` (shared with CLI) |
| natural language | pattern-routed to the same handlers |
| unmapped input | refuses, never fabricates |

### Consistency requirement

The CLI (`contribute.ts`) and TUI (`/contribute`) now both call
`runContribution()` in `src/core/contribution-runner.ts`. There is exactly one copy
of the workflow. Platfirmation verified by typecheck and the shared purchase of
`Approver`.

## NOT IMPLEMENTED (accepted as remaining work)

1. **Step-by-step wizard** — the user types commands rather than being walked 1→N
   through a guided flow. Interactive gates exist, but there is no linear walkthrough.
2. **Issue picker with cursor navigation** — selection is by re-issuing a reference.
3. **Loading spinners / progress bars** — `busy` is shown in the composer prefix only.
4. **First-launch welcome screen** — `osspilot doctor` + SETUP.md cover this.
5. **Error-classified displays** — errors render as activity lines, not typed dialogs.
6. **Session list panel** — history is available via `/status`, `osspilot history`, `osspilot resume`.
7. **Provider management screen** — provider config is via `osspilot config`.
8. **PR monitoring panel** — PR data is via `osspilot prs` and `osspilot revise`.

These are documented in `OSSPILOT_RELEASE_BLOCKERS.md` rather than being
represented as done.

## Acceptance verdict

| Level | Verdict |
|---|---|
| Interactive approval flows | **ACCEPTED** (COMPLETE) |
| Live monitoring data | **ACCEPTED** (COMPLETE) |
| Command surface | **ACCEPTED** (COMPLETE) |
| Full guided wizard | **NOT ACCEPTED** (NOT IMPLEMENTED) |

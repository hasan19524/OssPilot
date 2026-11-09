# OSSPilot Remaining Limitations

## Status legend: COMPLETE / PARTIAL / BLOCKED / NOT IMPLEMENTED / UNTESTED

## TUI

| Capability | Status | Notes |
|---|---|---|
| Header (brand, repo, branch, GitHub/provider/OpenCode status) | PARTIAL | Static shell + live contribution context |
| Main activity/conversation area | PARTIAL | Shows real contribution events from SQLite; no agent conversation history |
| Live OpenCode activity | PARTIAL | Progress via persisted events; no live SSE stream |
| Prompt composer | PARTIAL | Input captured; not yet dispatched to services |
| Context sidebar | PARTIAL | Real repo/issue/stage data |
| Diff / changed-files / tests panels | COMPLETE | Real worktree data |
| Trigger discovery/contribute from TUI | NOT IMPLEMENTED | CLI-driven; documented |
| Approval dialogs in TUI | NOT IMPLEMENTED | CLI prompts |
| First-launch welcome + setup wizard | NOT IMPLEMENTED | `doctor` + SETUP.md instead |
| Command palette (Ctrl+P) | NOT IMPLEMENTED | Keybind placeholder only |

## Contribution workflow

| Stage | Status |
|---|---|
| Discover → analyse → plan → approve | COMPLETE (CLI) |
| Clone / worktree / branch | COMPLETE |
| OpenCode investigation + implementation | PARTIAL (sync prompt + polling) |
| Independent verification | COMPLETE |
| Diff review | COMPLETE |
| Commit creation | COMPLETE (WorktreeManager.commit) |
| PR generation | COMPLETE |
| PR submission (Octokit direct + gh fallback) | COMPLETE |
| PR monitoring (`osspilot prs`) | COMPLETE |
| Maintainer-feedback revision loop | NOT IMPLEMENTED |

## Open Source Intelligence

| Capability | Status |
|---|---|
| Project health report | COMPLETE |
| Issue classification + signals | COMPLETE |
| Suitability scoring (explainable) | COMPLETE |
| Local requirements inspection | COMPLETE |
| Skill matching | PARTIAL (text matching only, not semantic) |
| Repository deep inspection (architecture, data flow) | NOT IMPLEMENTED |
| Maintainer response-time metrics | BLOCKED (not available via public API) |
| CHAOSS-style detailed metrics | NOT IMPLEMENTED |
| AI-contributed plan/analysis in `research` | NOT IMPLEMENTED (deterministic only — deliberate) |

## GitHub integration

| Capability | Status |
|---|---|
| Auth (PAT / keyring / gh bootstrap / device flow) | COMPLETE |
| Repo search + details + cache | COMPLETE |
| Issues, comments, labels | COMPLETE |
| PR list + monitor (status/comments/reviews/CI) | COMPLETE |
| PR create | COMPLETE |
| ETag conditional requests | NOT IMPLEMENTED |
| Auto-pagination | NOT IMPLEMENTED |
| Webhooks | NOT IMPLEMENTED |
| GraphQL | NOT IMPLEMENTED |

## LLM providers

| Capability | Status |
|---|---|
| 7 providers registered | COMPLETE |
| Availability check | COMPLETE |
| Structured output | COMPLETE (BharatCode/OpenAI), UNTESTED live |
| Timeout / retry / backoff | NOT IMPLEMENTED (BharatCode 503 retry only) |
| Usage/cost tracking | NOT IMPLEMENTED |
| Provider selection UI | NOT IMPLEMENTED |

## Security

All 10 original findings: COMPLETE (see OSSPILOT_FINAL_SECURITY_AUDIT.md).
Remaining: secrets-in-diff detection NOT IMPLEMENTED; Docker isolation NOT IMPLEMENTED.

## External blockers

| Blocker | Impact |
|---|---|
| BharatCode subscription required (HTTP 402) | AI-powered issue analysis untested live |
| No other LLM key provided | Only offline/mock paths tested for other providers |
| No paid model for OpenCode | Coding task not driven to completion |

## Testing gaps

- No E2E test of a full contribution to completion (requires live OpenCode + LLM + GitHub)
- No TUI rendering tests
- Octokit integration tests use live API, not fixtures (rate limits apply)
- Coverage: ~30% statements (measured)

# OSSPilot — Release Blockers

## VERDICT: **NOT READY for public release.** VERDICT for **internal testing: YES**.

---

## HARD BLOCKERS (must be resolved before any public release)

| # | Blocker | Category | Why it blocks |
|---|---|---|---|
| B1 | **No paid LLM provider credential** → the full coding path is unverified | BLOCKED | The core promise "delegate implementation to OpenCode" cannot be demonstrated. Steps 1–3 and 5–10 of the coding test are verified; step 4 (execution) is not. |
| B2 | **TUI is a command surface, not a guided wizard** | NOT IMPLEMENTED | First-run users cannot complete a contribution without knowing commands. No welcome screen, no step-by-step flow, no cursor issue picker. |
| B3 | **Coverage 40%** | PARTIAL | The GitHub adapter, LLM providers, and OpenCode adapter have live-call paths with no tests. Suite grew 106 → 126 but critical external integrations remain untested against fixtures. |
| B4 | **No end-to-end test of a completed contribution** | BLOCKED | Requires B1. Everything downstream of the paid model is unverified end-to-end. |

## SOFT BLOCKERS (degrade quality, not safety)

| # | Item | Status |
|---|---|---|
| S1 | GitHub rate-limit + pagination not integration-tested | PARTIAL |
| S2 | `gh` CLI not made optional in every path (direct Octokit exists, fallback uses `gh`) | PARTIAL |
| S3 | OpenCode SSE streaming untested (`streaming: false` honestly) | UNTESTED |
| S4 | No loading/progress UI in TUI | NOT IMPLEMENTED |
| S5 | No clean-machine install verification (no Bun/Node VM) | UNTESTED |
| S6 | Encrypted-file credential fallback lacks a rotation mechanism | PARTIAL |
| S7 | No sandboxing of contributed code (worktrees are not security sandboxes) | NOT IMPLEMENTED |
| S8 | Device flow uses a placeholder OAuth client id | PARTIAL |
| S9 | macOS / Linux untested | UNTESTED |

## Explicitly NOT blocking

| Item | Reason |
|---|---|
| Single package (not monorepo) | Appropriate for a local-first developer tool. |
| SQLite | Documented decision, working, migration-tested. |
| OpenCode-only agent support | Documented v1 scope; adapter interface is extensible. |
| Missing repository feedback revision UI | Revision *planning* works via `osspilot revise`. |

## Evidence for each level

### Personal development use — READY
Verified: doctor (0/0), discover, issue, research, revise, prs, resume, status, history, TUI start, approval gates, recovery safety, 126 tests.

### Internal testing — READY
All of the above plus: command policy enforced in every execution path, session recovery with confirmation gates, partial-failure transparency, malicious-input handling tested.

### Public open-source release — NOT READY
Blocked by B1–B4. Additionally needs S1–S4.

### Production use — NOT READY
Blocked by all of the above plus monitoring/observability, update mechanism, multi-user, and S6–S9.

## To clear B1 + B4 (the critical path)

```bash
# 1. Put a real provider key in OpenCode
opencode auth

# 2. Verify OpenCode executes
opencode run "say hi"

# 3. Run the disposable-repo coding test
osspilot contribute owner/repo#123

# 4. Re-run OSSPILOT_REAL_CODING_TEST_REPORT checkpoints 4-10
```

No money has been spent and no subscription purchased while producing this report.

# OSSPilot - Final Security Audit

Date: 2026-11-10 - Range: recent session - Tests: 165 pass - Coverage: 40.87% measured

## Re-verification of prior findings

| Finding | Status | Re-verification evidence |
|---|---|---|
| SEC-001 git argument injection | CLOSED | sanitizeGitArg allowlist + -- separators + owner/repo/branch regex. 9 tests. |
| SEC-002 path traversal | CLOSED | contribution id regex, assertPathContainment on every path op. 8 tests. |
| SEC-003 hardcoded encryption key | CLOSED | env -> keyring random 256-bit -> fail-loud. Wrong-key rejection test. |
| SEC-004 filesystem permissions | CLOSED | ensurePaths chmod 0700, DB file 0600 on Unix. |
| SEC-005 server password on stdout | CLOSED | stdout destroyed immediately after capture. |
| SEC-006 prompt injection | CLOSED (layered) | sanitise + delimiters + permission gate + policy + approval gates. |
| SEC-007 GitHub ref validation | CLOSED | strict regex + length limits. 10 tests. |
| POL-001 command policy not enforced | CLOSED | classifyCommand inside git() and runShell(). 4 tests. |
| LOG-001 no log sanitisation | CLOSED | sanitizeValue/sanitizeData in both sinks. |
| DIST-001 migrations skipped in compiled binary | CLOSED | embedded MANIFEST + idempotent runner; clean-home run verified. |
| AGENT-001 headless auto-reject of file edits | CLOSED | session permission ruleset + live reply loop; real edit verified. |
| CHAIN-001 reasoning could leak into output | CLOSED | reasoning parts filtered in message parsing. |

## New security work this cycle

### 1. Agent runtime status is honest
getStatusReport() distinguishes NOT_INSTALLED, NOT_AUTHENTICATED, IDLE, CONNECTED,
DISCONNECTED, ERROR. A binary existing never implies CONNECTED.

### 2. Permission handling with a policy
The session ruleset allows file edits inside the isolated worktree, denies network
fetches, and leaves shell at "ask". The reply loop approves FILE_EDIT_TOOLS once and
rejects everything else, surfacing it as an event.

### 3. Session persistence without secrets
sessions and session_messages store transcript and context only. No API keys.

## Verified attack surface

| Attack | Test | Result |
|---|---|---|
| git flag injection | rejects owner starting with dash | rejected |
| path traversal | rejects invalid contribution ID | rejected |
| flag injection in refs | rejects flag injection | rejected |
| rm -rf /, mkfs, format | policy test | denied |
| malicious CONTRIBUTING.md | does not execute content from repo files | not executed |
| instruction injection in issue/review text | redaction + delimiter tests | redacted/delimited |
| wrong encryption key | fails decryption with wrong key | rejected |
| unknown TUI command | rejects unknown commands | rejected |
| unmapped natural language | refuses to fabricate | refused |
| unconfirmed abandon | abandon WITHOUT --confirm is refused | refused, no state change |

## Residual risks

| Risk | Severity | Note |
|---|---|---|
| Git worktrees are not OS sandboxes | MEDIUM | Documented; Docker isolation not implemented. |
| Headless file-edit auto-approval | MEDIUM | Scoped to the isolated disposable worktree; network denied; shell gated by policy. |
| Free provider non-determinism | MEDIUM | Records honestly; not an OSSPilot defect. |
| Delimiters + redaction are defence-in-depth | MEDIUM | Real control points are gates, policy and containment. |
| No own LLM rate limiter | LOW | Octokit throttle covers GitHub. |

## Verdict

No CRITICAL or HIGH findings open. Adequate for internal testing and developer beta.
Residual MEDIUM items require sandboxing architecture rather than bug fixes.
# OSSPilot — Final Security Review

Date: 2026-11-09 · Range: `c03ff7d..HEAD` · Tests: **141 pass** · Coverage: **40.08% measured**

## Re-verification of prior findings

| Finding | Status | Re-verification evidence |
|---|---|---|
| SEC-001 git argument injection | **CLOSED** | `sanitizeGitArg` allowlist + `--` separators + owner/repo/branch regex. 9 tests. Confirmed: `--upload-pack=evil`, `-x/repo#1`, `../evil/repo#1` rejected. |
| SEC-002 path traversal | **CLOSED** | contribution id regex `contrib-\d+-[a-f0-9]{8}`, `assertPathContainment` on every path operation. 8 tests. |
| SEC-003 hardcoded encryption key | **CLOSED** | env → keyring random 256-bit → fail-loud. `fails decryption with wrong key` test passes. Migration path tested. |
| SEC-004 filesystem permissions | **CLOSED** | `ensurePaths()` chmod 0700, DB file 0600 on Unix. Windows no-op documented. |
| SEC-005 server password on stdout | **CLOSED** | stdout destroyed immediately after capture. |
| SEC-006 prompt injection | **CLOSED (layered)** | sanitise + delimiters + permission gate + policy + approval gates. 4 tests. |
| SEC-007 GitHub ref validation | **CLOSED** | strict regex + length limits. 10 tests. |
| POL-001 command policy not enforced | **CLOSED** | `classifyCommand` inside `git()` and `runShell()`. 4 tests. |
| LOG-001 no log sanitisation | **CLOSED** | `sanitizeValue`/`sanitizeData` in both sinks. |
| DIST-001 (new) migrations skipped in compiled binary | **CLOSED** | embedded MANIFEST + idempotent-safe runner; clean-home run verified; 4 tests. |

## New security work this cycle

### 1. Windows executable resolution (`src/core/exec.ts`)

Verified with `resolveCommand`:
- `opencode` → real `.exe` under `@opencode/cli/bin`
- `git` → `C:\Program Files\Git\cmd\git.exe`
- `gh` → `.local\bin\gh.exe`
- `agent-browser` → its real `.exe` (bug found & fixed: the opencode shim resolution was contaminating other commands' resolution)

### 2. Single-source approval gates (`src/core/contribution-runner.ts`)

CLI and TUI both call `runContribution()`. Gates:
1. preflight-blocker override
2. agent permission requests
3. `USER_APPROVAL_PLAN`
4. `USER_APPROVAL_PR`
5. final external action (git push + PR creation)

None can be auto-confirmed; the TUI swallows all keys except `y`/`n` while a gate is open.

### 3. Session recovery (`src/core/recovery.ts`)

`EXTERNAL_STAGES` flagged so resume is explicitly at a stage where an external action was pending; `abandon` without `--confirm` refused with state unchanged; `abandon --confirm` cancels the record and preserves the worktree path.

### 4. Partial-failure transparency

`PrStatus.partialFailures` records failed auxiliary sections; PR fetch remains a hard error.

## Verified attack surface

| Attack | Test | Result |
|---|---|---|
| git flag injection | `rejects owner starting with dash` | rejected |
| path traversal | `rejects invalid contribution ID` | rejected |
| flag injection in refs | `rejects flag injection` | rejected |
| `rm -rf /` | policy test | denied |
| `mkfs`/`format` | policy test | denied |
| `git reset --hard` | policy test | requires approval |
| malicious CONTRIBUTING.md | `does not execute content from repo files` | not executed |
| instruction injection in issue/review text | redaction + delimiter tests | redacted/delimited |
| wrong encryption key | `fails decryption with wrong key` | rejected |
| unknown TUI command | `rejects unknown commands` | rejected |
| unmapped natural language | `refuses to fabricate` | refused |
| unconfirmed abandon | `abandon WITHOUT --confirm is refused` | refused, no state change |

## Residual risks (not fully closed)

| Risk | Severity | Note |
|---|---|---|
| Git worktrees are not OS sandboxes | MEDIUM | Documented; Docker isolation not implemented |
| Encrypted-file fallback depends on keyring/env | MEDIUM | Headless path documented |
| Delimiters + redaction are defence-in-depth, not a complete injection defence | MEDIUM | Real control points are gates, policy and containment |
| No own LLM rate limiter | LOW | Octokit throttle covers GitHub |
| `/contribute` to completion untested end-to-end | HIGH (functional, not a vulnerability) | Provider blocked, not code blocked |

## Verdict

No CRITICAL or HIGH security findings open. Adequate for internal testing. Residual
MEDIUM items require sandboxing architecture rather than bug fixes.
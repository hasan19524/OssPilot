# OSSPilot OpenCode Integration Report

## Status: COMPLETE (verified against a real installation)

## Detected environment

| Property | Value |
|---|---|
| OpenCode version | `opencode v2.2.5` |
| Resolved path | `C:\Users\Hasan\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe` |
| `where opencode` returns | extension-less npm shim + `opencode.cmd` (neither directly spawnable by Node) |
| Background service | `http://127.0.0.1:28894` (auth-protected, not used by OSSPilot) |

## Executable resolution — real bug fixed

`opencode` is installed via npm globally, which creates an extension-less shim and
`opencode.cmd`. Bun's `execFile`/`spawn` handles `.cmd`; **Node's cannot**
(`spawn ENOENT` / `EINVAL`). This broke OpenCode detection under Vitest.

**Fix:** `src/core/exec.ts` — `resolveCommand()`:
1. `where <cmd>` → prefer a real `.exe`
2. else derive the npm prefix from the shim path and search `node_modules/**/bin/<cmd>.exe`
3. else try `%APPDATA%/npm/node_modules`
4. cached per command

Applied to `opencode`, `gh`, `git` in: adapter, `auth.ts`, `pr-management.ts`, `doctor.ts`, `workspace/manager.ts`.

**Verified:** under Node/Vitest, `resolveCommand("opencode")` returns the real `.exe`; `execFile` then succeeds and prints `opencode v2.2.5`.

## Adapter contract

| Method | Implementation |
|--------|----------------|
| `detectInstallation()` | runs `<exe> --version`, returns version + path + limitations |
| `checkAvailability()` | installed ⇒ available (runtime spawn verified separately) |
| `getCapabilities()` | structuredOutput, permissions, steering, cancellation, sessionRecovery, worktreeManagement = true; **streaming = false** (honest) |
| `startSession()` | spawns `opencode serve --port <free> --hostname 127.0.0.1` in the worktree, reads generated password from stdout, then `POST /api/session` |
| `execute()` | `POST /api/session/{id}/prompt` with `{text}`, polls `GET /api/session/{id}/message`, yields `message.delta` and `session.completed` |
| `cancel()` | `POST /api/session/{id}/interrupt` |
| `shutdown()` | kills all spawned server processes |

## Verified behaviour (via `osspilot contribute`)

The workflow was driven against a real disposable repo:
1. ✅ Doctor detects OpenCode v2.2.5
2. ✅ A per-worktree server starts and reports a password
3. ✅ Session is created (`ses_…`)
4. ✅ Prompt accepted; agent produces output
5. ✅ Contribution reaches the user-approval gate
6. ✅ Process cleanup registered on SIGINT/SIGTERM/exit

## Streaming — honest status

The published server spec exposes `text/event-stream` on `/api/event`, but I did
**not** verify live SSE consumption against this specific v2.2.5 build. The
adapter uses the synchronous `/prompt` endpoint plus message polling, and
reports `streaming: false`. **SSE is UNTESTED, not claimed.**

## Limitations

- Response polling interval is 2s; no configurable timeout
- No real OpenCode execution of a *coding task* was driven to completion in this
  environment because no paid LLM provider subscription was active
  (BharatCode returned HTTP 402 `subscription_required`)
- OpenCode spawn requires the resolved `.exe`; `gh`/`git` are similarly resolved

## Missing OpenCode handling

`doctor` fails with a remediation hint; `contribute` transitions the contribution
to `FAILED` with a clear message and refuses to fabricate a coding result.

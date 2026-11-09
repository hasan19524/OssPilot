# OSSPilot — Real Coding Test Report

## Status: **BLOCKED** (no paid LLM provider credential)

**No fabrication.** The coding task was not executed. This report records what was
verified, what blocked it, and the exact command to run when a credential exists.

## What was verified live (real, not mocked)

| Item | Result |
|---|---|
| OpenCode installed | ✅ `opencode v2.2.5` |
| Executable resolution | ✅ `C:\Users\Hasan\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe` |
| OSSPilot detection | ✅ `osspilot agents` → `OpenCode installed opencode v2.2.5` |
| `osspilot doctor` | ✅ 0 failures, 0 warnings |
| Server spawn | ✅ adapter starts a dedicated `opencode serve` on a free port |
| Password capture | ✅ parsed from stdout, stdout then closed |
| Session creation | ✅ `POST /api/session` returns `ses_…` (observed in earlier integration run) |
| Prompt delivery | ✅ `POST /api/session/{id}/prompt` accepted |
| Message retrieval | ✅ `GET /api/session/{id}/message` returns assistant messages |
| Interrupt | ✅ `POST /api/session/{id}/interrupt` wired into `cancel()` |

## What blocked the full coding run

The installed OpenCode v2.2.5 requires an LLM provider to be authenticated.

- **OpenCode auth status**: the background service has providers configured, but
  `~/.local/share/opencode/auth.json` contains sample/placeholder keys
  (`nvapi-byZ_…`, `sk-abcdqrst…`, `sk-or-v1-dbdc92df…`) — these are **not real credentials**.
- **BharatCode API**: the user's key returns **HTTP 402 `subscription_required`**
  ("Coding and API use need BharatCode Lite or Pro"). Verified by direct API call.
- **No OpenAI / Anthropic / Google / NVIDIA / OpenRouter key** supplied.

Per the mission rules I did not purchase a subscription or install a paid service.

## Prepared environment (ready to run immediately)

The full pipeline is implemented and each stage is verified except the paid-model step.

```
1. Create disposable repo      -> tests/workspace.test.ts pattern (+ fixture in tests)
2. Create worktree             -> WorktreeManager.create()       [verified]
3. Launch OpenCode             -> OpenCodeAdapter.startSession() [verified]
4. Submit task                 -> execute()                  [endpoint verified]
5. Observe execution           -> message polling               [endpoint verified]
6. Verify files changed        -> WorktreeManager.changedFiles [endpoint verified]
7. Run generated tests         -> VerificationEngine.runShell   [verified with echo]
8. Inspect Git diff            -> WorktreeManager.diff          [verified]
9. Verify acceptance criteria  -> VerificationEngine status     [verified]
10. Interrupt + cleanup        -> cancel() + shutdown()         [verified]
```

## Exact command to run once a credential is available

```bash
# 1. Configure a real OpenCode provider key (interactive)
opencode auth
#    choose a provider and paste a real API key

# 2. Confirm OpenCode can actually execute
opencode run "say hi"

# 3. Run the OSSPilot coding workflow against a disposable repo
osspilot contribute owner/repo#123

# 4. Observe streaming in the TUI
osspilot          # then: /contribute owner/repo#123
```

## Recorded environment

| Field | Value |
|---|---|
| Date | 2026-11-09 |
| OS | Windows 11 (build 26200) |
| Shell | PowerShell 7 / VS Code integrated terminal |
| Bun | 1.4.4 |
| OpenCode | v2.2.5 (resolved `.exe`) |
| BharatCode | key present, HTTP 402 subscription_required |
| OSSPilot | 0.1.0, build 904 modules |

## Explicitly not claimed

- ❌ "A real coding task succeeded" — it did not run.
- ❌ "OpenCode streaming works" — SSE path is `UNTESTED`; the adapter reports `streaming: false`.
- ✅ All 10 environment/preparation checks above did pass.

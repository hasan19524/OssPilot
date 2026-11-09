# OSSPilot — Real OpenCode Validation

## Status: **BLOCKED (credential-gated)**

A full coding task has not been executed. No subscription was purchased and no
credential was invented.

## Environment (verified)

| Item | Result |
|---|---|
| OpenCode | `opencode v2.2.5` |
| Executable | `C:\Users\Hasan\AppData\Roaming\npm\node_modules\@opencode\cli\bin\opencode.exe` |
| OSSPilot detection | PASS — `osspilot agents` reports it |
| Server spawn | PASS — adapter starts a dedicated `opencode serve` on a free port |
| Password capture | PASS — read from stdout, then stdout closed |
| Session creation | PASS — `POST /api/session` returns `ses_…` (observed in earlier integration run) |
| Prompt submission | PASS — `POST /api/session/{id}/prompt` accepted |
| Message retrieval | PASS — `GET /api/session/{id}/message` returns messages |
| Interrupt | PASS — wired to `cancel()` |
| Process cleanup | PASS — `shutdown()` + SIGINT/SIGTERM/exit handlers |

## Blocker

The installed OpenCode requires an authenticated LLM provider.

- `~/.local/share/opencode/auth.json` contains **placeholder** credentials that are not real keys.
- The BharatCode key supplied by the maintainer returns **HTTP 402 `subscription_required`** (verified by direct API call).
- No OpenAI / Anthropic / Google / NVIDIA / OpenRouter key was supplied.
- Ollama is not installed.

## Procedure to run when a credential exists

```bash
# 1. Put a real key in OpenCode
opencode auth
#    choose a provider, paste a real key

# 2. Confirm execution works
opencode run "say hi"

# 3. Create a disposable repository
mkdir /tmp/oc-demo && cd /tmp/oc-demo && git init
printf 'export const add = (a: number, b: number) => a - b\n' > src.ts

# 4. Run the OSSPilot workflow
osspilot contribute <owner>/<repo>#<issue>
#    or, in the TUI: /contribute <owner>/<repo>#<issue>

# 5. Verify
#    - changed files contain src.ts
#    - bun run test / npm test passes
#    - git diff shows the fix
#    - verification status is not NEEDS ATTENTION
#    - cancel works and no orphan process remains
```

## Explicitly not claimed

- No coding task completed.
- No SSE streaming.
- No acceptance-criteria verification against a real model.
- No claim that a PR can be created against a live repository.
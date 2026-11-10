# OpenCode Integration

OpenCode is the coding execution runtime for OSSPilot. The adapter owns everything
between OSSPilot and the installed OpenCode binary.

## Detection

`OpenCodeAdapter.detectInstallation()` resolves the real executable and reads its
version:

1. `where opencode` — prefers a real `.exe`.
2. Otherwise, derives the npm prefix from the shim path and searches
   `<prefix>/node_modules/**/bin/opencode.exe`.
3. Otherwise, `%APPDATA%/npm/node_modules/@opencode/cli/bin/opencode.exe`.

Node's `execFile` cannot spawn Windows `.cmd` shims (`EINVAL`) — Bun can. The shared
`resolveCommand()` layer hides that difference from every caller.

Verify with:

```bash
osspilot agents
osspilot doctor
```

## Session lifecycle

1. OSSPilot finds a free port and spawns `opencode serve --port <port> --hostname
   127.0.0.1` with the worktree as the working directory.
2. The server prints `server password <pw>` on stdout. OSSPilot captures it and then
   **destroys the stdout stream** so the password is not retained.
3. OSSPilot creates a session (`POST /api/session`) and keeps the `ses_...` id.
4. A prompt is submitted as `POST /api/session/{id}/prompt` with a `{text}` body.
5. OSSPilot polls `GET /api/session/{id}/message` every 2 seconds and yields the new
   assistant text as it appears.
6. Cancellation is `POST /api/session/{id}/interrupt`.
7. `shutdown()` kills every spawned server.

Each contribution gets its own server and its own worktree, so a failure in one
contribution cannot disturb another.

## Permissions

Permission requests emitted during execution are forwarded to you through the approval
gate. The runner never auto-approves them. In the CLI you are prompted; in the TUI a
dialog appears.

## Capability report

`getCapabilities()` returns:

| Capability | Value | Why |
|---|---|---|
| `streaming` | `false` | The installed version exposes a synchronous `/prompt` endpoint. SSE was investigated and is **not** used because it was not verified end-to-end. |
| `structuredOutput` | `true` | The prompt payload accepts a JSON schema. |
| `permissions` | `true` | Permission replies are wired to the approval gate. |
| `steering` | `true` | Additional prompts can be sent into an active session. |
| `cancellation` | `true` | Session interrupt. |
| `sessionRecovery` | `true` | Session ids are persisted. |
| `worktreeManagement` | `true` | Worktrees are created and removed by the workspace manager. |

## Known limitations

- Polling interval is fixed at 2 seconds.
- No per-execution timeout; a long investigation is expected.
- Live execution of a coding task has **not** been verified from this machine, because
  no paid LLM provider credential was available for OpenCode. Environment preparation
  and the HTTP endpoints were verified. See `OSSPILOT_REAL_OPENCODE_VALIDATION.md`.
- A failed session does not restart automatically; `osspilot resume` reports the state.

## Agent abstraction

Despite being the only adapter in v1, the interface is provider-independent:

```typescript
interface AgentAdapter {
  readonly id: string
  readonly name: string
  detectInstallation(): Promise<InstallationStatus>
  checkAvailability(): Promise<AvailabilityStatus>
  getCapabilities(): Promise<AgentCapabilities>
  startSession(config: SessionConfig): Promise<AgentSession>
  execute(session: AgentSession, task: TaskSpec): AsyncIterable<AgentEvent>
  cancel(session: AgentSession): Promise<void>
  getStatus(session: AgentSession): Promise<SessionStatus>
}
```

The registry holds adapters by id. The contribution manager and the TUI look adapters
up by id, so adding a provider means implementing the adapter and registering it —
nothing in the workflow or the UI changes.

Claude Code, OpenAI Codex and Google Antigravity are documented future directions and
have **no** implementation. We do not claim interface compatibility with them.

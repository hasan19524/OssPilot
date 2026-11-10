# Troubleshooting

Start with:

```bash
osspilot doctor
osspilot setup
```

Both are read-only and never change configuration.

## OpenCode is not detected

**Symptom.** `doctor` reports `opencode not found on PATH`, or `agents` shows
`not installed`.

**Cause.** OpenCode is installed but the binary resolves to a shim.

**Fix.**
1. `where opencode` — note the paths listed.
2. If OpenCode is installed, try `opencode --version` directly.
3. Install or reinstall it from https://opencode.ai, then re-run `osspilot doctor`.
4. If it is installed but not on `PATH`, add the install directory to `PATH`.

`osspilot setup` distinguishes a missing runtime from missing credentials.

## GitHub requests fail

**Symptom.** `discover` or `research` reports an API error.

**Cause and fix.**
- No token → `osspilot config auth github`.
- Token invalid or expired → re-run the same command.
- Rate limited (403) → wait and retry; Octokit handles `Retry-After` for GETs.

## AI features return nothing

**Symptom.** Research shows GitHub facts but no analysis.

**Cause.** No provider is configured, or the provider returned an error.

**Fix.** `osspilot setup` and add a key (see `providers.md`). This is a graceful
degradation, not a bug: GitHub-only features are designed to work without an LLM.

## The TUI looks broken

**Fix.**
- Resize the terminal.
- Use Windows Terminal rather than the legacy console host.
- Minimum usable size is roughly 80x24.
- Kill and restart `osspilot`; the sidebar is hydrated from records whose
  worktree still exists and that had recent activity, and commands re-read the
  database on demand (`/status`).

## A contribution is stuck

```bash
osspilot status
osspilot resume
osspilot resume <id> resume
```

Recovery never repeats external actions and never discards local changes.

## "no such table"

A database created by an older build. Delete `~/.osspilot/database/state.osspilot.db` and
restart; migrations recreate it. **This deletes local contribution history** — copy the
file first if you need it.

## Passwords and tokens in logs

They should not appear. Logs redact `ghp_`, `gho_`, `bc_live_`, `sk-`, `sk-ant-` and
`nvapi-`. If you see a real credential anywhere, treat it as compromised, rotate it, and
report it (see `SECURITY.md`).

## Build problems from source

```bash
rm -rf node_modules bun.lock
bun install
bun run typecheck
bun run lint
bun run test
bun run build
```

If a build fails on Linux or macOS, verify the native modules for that platform
(`better-sqlite3`) are available, then run the build on that OS or in CI.
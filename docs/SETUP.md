# OSSPilot — What You Need To Do

## 1. Install prerequisites

- **Bun >= 1.4.0** — `npm i -g bun` (or download from https://bun.sh)
- **Git** — https://git-scm.com
- **gh CLI** (optional, for token bootstrap) — https://cli.github.com
- **OpenCode** (for agent integration) — https://opencode.ai

Verify: `bun --version`, `git --version`, `opencode --version`

## 2. Build OSSPilot

```bash
cd D:\projects\personal\Osspilot
bun install
bun run build          # produces dist/osspilot.exe
```

## 3. Configure credentials

### GitHub (choose one)

**Option A — Device flow (recommended):**
```bash
osspilot config auth github
```
Follow the browser prompt. Token stored in OS keyring (Windows Credential Manager).

**Option B — Environment variable:**
```bash
setx OSSPILOT_GITHUB_TOKEN "ghp_your_token_here"
```

**Option C — Reuse gh CLI:**
If `gh auth status` shows logged in, OSSPilot auto-bootstraps (with consent).

### BharatCode (optional, for AI features)

1. Get a key at https://bharatcode.ai/account
2. Run:
```bash
osspilot config auth bharatcode
```
Or set `OSSPILOT_BHARATCODE_API_KEY` env var.

Without a key, OSSPilot works in GitHub-only mode (no AI analysis).

## 4. Configure preferences

```bash
osspilot config                    # show current
osspilot config reset              # restore defaults
```

Edit `~/.osspilot/config/config.json` to set:
- `skills`: your tech skills (e.g. `["typescript", "python", "react"]`) for skill matching
- `preferredAgent`: "opencode" (only option in v1)
- `bharatcodeModel`: "qwen-3.8-27b" (default) or "deepseek-v4.1-flash" (Pro)

## 5. Verify setup

```bash
osspilot doctor
```

All checks should pass (warnings for unset tokens are OK if you chose not to configure them).

## 6. Use it

```bash
osspilot                              # launch TUI
osspilot discover                     # find contribution opportunities
osspilot issue owner/repo#123         # analyse an issue
osspilot contribute owner/repo#123    # full workflow with approval gates
osspilot status                       # active contributions
osspilot history                      # past contributions
osspilot agents                       # agent integration status
```

## 7. What's NOT needed from you

- No database setup (SQLite is embedded)
- No Redis/Docker/PostgreSQL (all local)
- No cloud deployment (runs entirely on your machine)
- No manual migration (auto-applied on first run)

## 8. Troubleshooting

- `osspilot doctor` — checks everything
- Logs: `~/.osspilot/logs/osspilot.log`
- Reset: delete `~/.osspilot/` and re-run
- OpenCode not found: ensure `opencode` is on PATH
- TUI rendering issues: try Windows Terminal instead of VS Code integrated terminal

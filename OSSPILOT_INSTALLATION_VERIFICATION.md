# OSSPilot Installation Verification

## Status: VERIFIED on Windows 11

## Build verification

```
$ bun run build
  [182ms]  bundle  895 modules
  [656ms]  compile  dist/osspilot.exe
```

Single-file executable, ~60-90 MB, no external runtime dependency on the target machine.

## Launch verification

| Command | Result |
|---|---|
| `.\dist\osspilot.exe doctor` | ✅ 0 failures, 0 warnings |
| `.\dist\osspilot.exe --version` | ✅ 0.1.0 |
| `.\dist\osspilot.exe discover --language typescript --limit 3` | ✅ live GitHub results |
| `.\dist\osspilot.exe issue octocat/Hello-World#1` | ✅ live issue |
| `.\dist\osspilot.exe research octocat/Spoon-Knife#1 --no-clone` | ✅ full 4-part report |
| `.\dist\osspilot.exe research octocat/Spoon-Knife#1` | ✅ including local clone + requirements |
| `.\dist\osspilot.exe prs` | ✅ "No pull requests tracked yet" |
| `.\dist\osspilot.exe agent`/`status`/`history` | ✅ work |
| `.\dist\osspilot.exe` (TUI) | ✅ renders; does not require a browser |

## Data paths

```
%USERPROFILE%\.osspilot\
  config\config.json          (validated user config)
  config\credentials.enc      (fallback credential store, 0600 on Unix)
  database\state.osspilot.db   (SQLite, WAL)
  repositories\                (clones)
  worktrees\                   (per-contribution worktrees)
  sessions\ logs\ cache\
```

Keyring credentials verified present (`doctor` → `github-token configured (OS keyring)`).

## Cross-runtime verification

The same source was exercised under:
- **Bun** (compiled binary and `bun run`)
- **Node/Vitest** (82 tests)

The Windows executable-resolution bug found here (`resolveCommand`) is fixed, and
OpenCode detection passes in **both** runtimes.

## Requirements on the user's machine

| Tool | Required | Notes |
|---|---|---|
| Bun ≥ 1.4 | yes | to build; not required to run the compiled binary |
| Git | yes | resolved via `where git` |
| OpenCode | for coding execution | everything else works without it |
| GitHub token | for GitHub features | OS keyring / env / gh bootstrap |
| LLM provider key | for AI features | BharatCode, OpenAI, Anthropic, Google, NVIDIA, OpenRouter, Ollama |

## What was NOT verified

- Clean-machine install (no pre-existing Bun/Node on a fresh Windows VM)
- macOS / Linux execution
- Single-binary compilation inlining SQLite native module on non-Windows targets

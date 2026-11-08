# CLI Reference

## Commands

### `osspilot` (default)
Launch the interactive TUI.

### `osspilot doctor`
Check local environment health.

**Options:**
- `--json` — Output machine-readable JSON

### `osspilot discover`
Discover open-source contribution opportunities.

**Options:**
- `-l, --language <lang>` — Filter by programming language
- `-q, --query <query>` — Search query (default: "good first issue")
- `--limit <n>` — Max results (default: 10)

### `osspilot issue <reference>`
Analyse a GitHub issue.

**Reference format:** `owner/repository#number`

**Example:** `osspilot issue prettier/prettier#20408`

### `osspilot contribute <reference>`
Start a contribution workflow.

**Reference format:** `owner/repository#number`

**Example:** `osspilot contribute prettier/prettier#20408`

### `osspilot status`
Show active contributions and their current stage.

### `osspilot agents`
Inspect coding-agent integration status.

### `osspilot config`
Show or edit user configuration.

**Subcommands:**
- `config show` — Print current config
- `config path` — Print config file path
- `config reset` — Reset config to defaults
- `config auth <provider>` — Authenticate (github or bharatcode)

### `osspilot history`
View past contributions.

### `osspilot prs [reference]`
Monitor pull requests from your contributions.

**Usage:**
- `osspilot prs` — all tracked PRs
- `osspilot prs owner/repo#123` — specific PR status, comments, reviews, CI checks

### `osspilot research <reference>`
Research an issue and repository: project health, issue intelligence, contribution suitability, repository deep inspection, contribution requirements.

**Reference format:** `owner/repository` or `owner/repository#123`

**Options:**
- `--no-clone` — skip local repository inspection

**Example:**
```bash
osspilot research prettier/prettier#20408
osspilot research octocat/Hello-World --no-clone
```

### `osspilot revise <reference>`
Analyse maintainer feedback on a PR and prepare a revision plan (requires approval before delegating to OpenCode; never posts replies automatically).

**Reference format:** `owner/repository#PR-number`

## Exit Codes

- `0` — Success
- `1` — Error (check stderr for details)

## Environment Variables

See README.md for the full list.
# CLI Reference

Command mode and the TUI use the same application core. Every command below was verified
against the built binary.

## Commands

### `osspilot`
Launch the interactive TUI.

### `osspilot doctor`
Check the local environment.

**Options:** `--json` — machine-readable output.
**Exit:** non-zero if any check fails.

### `osspilot setup`
First-run setup: reports required and optional components.
**Options:** `--json`.

### `osspilot discover`
Search GitHub repositories for contribution opportunities.

| Option | Meaning | Default |
|---|---|---|
| `-l, --language <lang>` | Filter by language | none |
| `-q, --query <query>` | Search query | `good first issue` |
| `--limit <n>` | Max results | `10` |

### `osspilot issue <reference>`
Analyse an issue (`owner/repo#number`).

### `osspilot research <reference>`
Project health, issue intelligence, suitability, repository deep inspection,
contribution requirements.

| Option | Meaning |
|---|---|
| `--no-clone` | Skip local repository inspection |

### `osspilot contribute <reference>`
Run the full contribution workflow with approval gates. The CLI and TUI share one
implementation.

### `osspilot prs [reference]`
Monitor pull requests from your contributions. With a reference, a full PR report
(status, comments, reviews, CI checks).

### `osspilot revise <reference>`
Retrieve maintainer feedback, classify reviews and comments, build a revision plan.
Requires approval before delegating to OpenCode. Never posts a reply.

### `osspilot resume [contribution-id] [action]`
Inspect interrupted contributions, or apply a recovery action.

Actions: `resume`, `inspect`, `restart`, `abandon`.

| Option | Meaning |
|---|---|
| `--json` | machine-readable list |
| `--confirm` | Required by `abandon` |

`abandon` without `--confirm` is refused and changes nothing.

### `osspilot status`
Active contributions and their stage.

### `osspilot history`
Past contributions.

### `osspilot agents`
Registered coding agents and detection results.

### `osspilot config [subcommand]`
Show or edit configuration.

| Subcommand | Meaning |
|---|---|
| `show` | print config (default) |
| `path` | config file path |
| `reset` | restore defaults |
| `auth <github\|bharatcode>` | store a credential |

## Environment variables

See `docs/PROVIDERS.md` and `docs/SETUP.md`.

## Exit codes

`0` success. `1` error — the message on stderr states what failed and what to do.

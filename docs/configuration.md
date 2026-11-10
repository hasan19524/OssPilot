# Configuration

OSSPilot keeps three kinds of state strictly separated: **preferences**
(readable JSON), **credentials** (OS keyring / encrypted file / environment)
and **data** (SQLite plus cloned repositories and worktrees).

## Preferences — `~/.osspilot/config/config.json`

```bash
osspilot config            # show the effective configuration
osspilot config reset      # restore defaults
osspilot config path       # print the file path
```

| Field | Meaning |
|---|---|
| `skills` | your technical skills, matched against issue text |
| `preferredAgent` | registry id of the coding agent (`opencode`) |
| `bharatcodeBaseUrl`, `bharatcodeModel` | provider endpoint and model |
| `logLevel`, `logSink`, `logFormat` | logging (`debug`/`info`/`warn`/`error`, `stderr`/`stdout`/`file`/`none`) |

```json
{ "skills": ["typescript", "react", "python", "rust"] }
```

The suitability score compares these against the issue text. With an empty
list the skill factor is reported as `unavailable` rather than guessed.

## Credentials

Never stored in config files, never written to logs. Resolution order:
**OS keyring → encrypted file → environment variable**.

| Provider | Command / variable |
|---|---|
| GitHub | `osspilot config auth github` or `OSSPILOT_GITHUB_TOKEN` |
| BharatCode | `osspilot config auth bharatcode` or `OSSPILOT_BHARATCODE_API_KEY` |
| OpenAI | `OSSPILOT_OPENAI_API_KEY` |
| Anthropic | `OSSPILOT_ANTHROPIC_API_KEY` |

OpenCode's own credentials (its `auth.json`) are read by the adapter only to
report *whether a provider is configured* — provider names and the pinned
model, never token material.

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `OSSPILOT_HOME` | data directory root | `~/.osspilot` |
| `OSSPILOT_LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `info` |
| `OSSPILOT_LOG_SINK` | `stderr` / `stdout` / `file` / `none` | `stderr` |
| `OSSPILOT_LOG_FORMAT` | `text` / `json` | `text` |

## Data directory

`~/.osspilot/` (override with `OSSPILOT_HOME`):

| Path | Contents |
|---|---|
| `config/` | preferences (no secrets) |
| `database/` | SQLite state |
| `repositories/` | cloned repositories |
| `worktrees/` | one worktree per contribution |
| `sessions/`, `cache/`, `logs/` | session and HTTP metadata, application logs |

## What works without what

| Without | Still works |
|---|---|
| GitHub token | local config, agent status, `doctor`, `setup` |
| LLM provider | research, health, intelligence, suitability, repository inspection |
| OpenCode | everything except implementation |

Implementation — and anything that touches GitHub or an LLM — reports a missing
dependency explicitly instead of pretending to work.

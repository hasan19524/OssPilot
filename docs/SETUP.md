# Setup

First-run setup and configuration. `osspilot setup` automates the checks below.

## Prerequisites

| Component | Required | Install |
|---|---|---|
| Git | Yes | https://git-scm.com |
| OpenCode | For code implementation | https://opencode.ai |
| Bun >= 1.4 | Only to build from source | `npm i -g bun` |

## First-run check

```bash
osspilot setup
```

Reported contents, each labelled required or optional:

1. **Git** — required.
2. **OpenCode** — required for implementation; research and discovery work without it.
3. **GitHub** — optional; `osspilot config auth github`.
4. **AI provider** — optional; `osspilot config auth bharatcode`.
5. **Web research** — optional; detected, never installed automatically.

`setup --json` emits the same report as JSON.

## Configuration

Preferences live in `~/.osspilot/config/config.json`:

```bash
osspilot config            # show
osspilot config reset      # restore defaults
osspilot config path       # file path
```

| Field | Meaning |
|---|---|
| `skills` | your technical skills, matched against issue text |
| `preferredAgent` | registry id of the coding agent (`opencode`) |
| `bharatcodeBaseUrl`, `bharatcodeModel` | provider endpoint and model |
| `logLevel`, `logSink` | logging |

## Secrets

Never in config files, never in logs.

| Provider | Command / variable |
|---|---|
| GitHub | `osspilot config auth github` or `OSSPILOT_GITHUB_TOKEN` |
| BharatCode | `osspilot config auth bharatcode` or `OSSPILOT_BHARATCODE_API_KEY` |
| OpenAI | `OSSPILOT_OPENAI_API_KEY` |
| Anthropic | `OSSPILOT_ANTHROPIC_API_KEY` |

Storage order: OS keyring → encrypted file → environment variable. A migration moves
legacy-encrypted credentials to a fresh key without destroying them.

## Skills

```json
{ "skills": ["typescript", "react", "python", "rust"] }
```

The suitability score compares these against the issue text. Leave the list empty and
the skill factor is reported as `unavailable` rather than guessed.

## Data directory

`~/.osspilot/`, or `OSSPILOT_HOME` in tests and portable installs.

## What works without what

| Without | Still works |
|---|---|
| GitHub token | local config, agent status, doctor, setup |
| LLM provider | research, health, intelligence, suitability, repository inspection |
| OpenCode | everything except implementation |

Implementation, and anything that touches GitHub or an LLM, never pretends to work when
its dependency is missing.

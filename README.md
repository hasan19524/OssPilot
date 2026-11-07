# OSSPilot

OSSPilot is a CLI-first, terminal-native platform that helps developers discover
open-source contribution opportunities, understand GitHub issues, investigate
repositories, delegate implementation to coding agents, verify changes, and prepare
pull requests.

The primary interface is the terminal. Run `osspilot` to launch the interactive
TUI (built with OpenTUI + React). Command mode (`osspilot doctor`, `osspilot status`,
...) shares the same application core.

## Status

Phase 1 (Foundation) complete:

- TypeScript project (strict) on Bun >= 1.4
- CLI (Commander) with `doctor`, `status`, `agents`, `config`, `history`, `discover`, `issue`, `contribute`
- OpenTUI rendering verified on Windows 11 (VS Code terminal + Windows Terminal)
- SQLite (better-sqlite3) + Drizzle ORM with versioned migrations
- `~/.osspilot/` layout and validated user config
- Structured logging, error handling, environment doctor
- Vitest suite (10 tests)

## Requirements

- Bun >= 1.4.0 (`npm i -g bun`)
- Git
- (optional) gh CLI for token bootstrap
- OpenCode (for agent integration, Phase 6+)

## Setup

```bash
bun install
bun run typecheck
bun run lint
bun run test
```

## Usage

```bash
bun run src/index.ts            # launch TUI
bun run src/index.ts doctor     # environment health check
bun run src/index.ts status     # active contributions
bun run src/index.ts config     # show config
bun run src/index.ts config --reset
```

## Development

```bash
bun run dev          # run TUI
bun run test:watch   # watch tests
bun run db:generate  # regenerate migrations after schema changes
```

## Configuration

Non-secret preferences live in `~/.osspilot/config/config.json`. Secrets (GitHub token,
BharatCode API key) are read from environment variables (see `osspilot config`).
Never commit secrets.

## Architecture

See `docs/PHASE0_AUDIT.md` for the full Phase 0 audit, architecture, dependency list,
roadmap, and risk register.

## License

MIT

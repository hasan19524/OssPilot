# Architecture

See [`../audits/OSSPILOT_ARCHITECTURE_DOCUMENTATION.md`](../audits/OSSPILOT_ARCHITECTURE_DOCUMENTATION.md)
for the diagrams and `contribution-standards.md` for the research hierarchy.

## Module map

```
src/
├── index.ts                 CLI entrypoint
├── cli/                     Commander commands (one file per command)
│   ├── bootstrap.ts         program assembly
│   └── commands/
│       ├── doctor.ts        environment checks
│       ├── setup.ts         first-run setup
│       ├── discover.ts      repository search
│       ├── issue.ts         issue analysis
│       ├── research.ts      full research report
│       ├── contribute.ts    the workflow (delegates to core)
│       ├── prs.ts           PR monitoring
│       ├── revise.ts        maintainer feedback + revision plan
│       ├── resume.ts        recovery
│       ├── status.ts        active contributions
│       ├── history.ts       past contributions
│       ├── agents.ts        agent status
│       └── config.ts        configuration and auth
├── tui/                     OpenTUI React interface
│   ├── launch.tsx           boots the renderer (exitOnCtrlC disabled)
│   ├── app/App.tsx          layout, views, composer, approval dialog
│   ├── intent.ts            deterministic natural-language routing (no LLM)
│   ├── dispatcher.ts        routes composer input to services, returns
│   │                        structured results (output/context/view/approval)
│   └── store.ts             UI state and the approval bridge
├── core/                    application services
│   ├── contribution-runner.ts  THE workflow (CLI and TUI both call this)
│   ├── contributions.ts        state machine + persistence
│   ├── recovery.ts             interrupted-work recovery
│   ├── doctor.ts               environment checks
│   ├── exec.ts                 Windows executable resolution
│   ├── research-capabilities.ts optional integrations
│   └── errors.ts               typed errors
├── agents/                  provider-independent agent layer
│   ├── base/adapter.ts      the interface
│   ├── registry.ts          registration and lookup
│   └── adapters/opencode/   the OpenCode adapter
├── integrations/
│   ├── github/              Octokit client, auth, issues, PRs, monitoring, preflight
│   ├── bharatcode/          intelligence service
│   └── llm/                 provider registry and implementations
├── intelligence/            research engine
│   ├── project-health.ts
│   ├── issue-intelligence.ts
│   ├── suitability.ts
│   ├── repo-inspection.ts
│   ├── requirements.ts
│   ├── maintainer-feedback.ts
│   └── revision.ts
├── workspace/               git clone, worktrees, diff, commit
├── verification/            independent verification
├── security/                credentials, crypto, policy, sanitise, audit
├── storage/
│   ├── database/            client, schema, embedded migrations
│   ├── migrations/          SQL + generated bundle
│   └── cache.ts             cached API responses
├── config/                  paths and settings
└── logging/                 structured logging
```

## Data flow

```
CLI ──┐
      ├──> core/contribution-runner ──> contributions (SQLite)
TUI ──┘        │                        recovery
               ├──> workspace (git CLI, worktrees)
               ├──> verification (tests, lint, diff)
               ├──> agents/adapters/opencode (spawn, sessions, prompt)
               ├──> integrations/github (Octokit)
               └──> security (policy, approval gates)
```

## Database tables

| Table | Purpose |
|---|---|
| `contributions` | one row per contribution; current stage, worktree, branch, PR |
| `contribution_events` | append-only journal of every transition |
| `agent_sessions` | agent sessions with their external session id |
| `workspaces` | worktree metadata |
| `test_results` | verification runs |
| `review_reports` | independent verification reports |
| `pull_requests` | generated and submitted PRs |
| `key_value` | cache and generic metadata |
| `audit_log` | security audit trail |
| `_osspilot_migrations` | applied migrations |

## State machine

Every stage is persisted. Non-terminal stages: `DISCOVER`, `ISSUE_VALIDATION`,
`ISSUE_ANALYSIS`, `WORKSPACE_CREATION`, `AGENT_INVESTIGATION`, `CONTRIBUTION_PLAN`,
`USER_APPROVAL_PLAN`, `IMPLEMENTATION`, `TESTING`, `INDEPENDENT_VERIFICATION`,
`CHANGE_REVIEW`, `PR_PREPARATION`, `USER_APPROVAL_PR`, `PR_SUBMISSION`.
Terminal: `CANCELLED`, `FAILED`.

`USER_APPROVAL_PLAN` and `USER_APPROVAL_PR` are terminal for the user — a pause.

## Decisions

Recorded in the README and in `contribution-standards.md`:
terminal-native, TypeScript on Bun, SQLite local-first, OpenCode first behind an
adapter, BharatCode first behind a provider registry, Octokit over GitHub CLI, Git via
controlled processes, state-driven workflow, worktrees for isolation, verification
separate from the agent, approval gates for external actions.

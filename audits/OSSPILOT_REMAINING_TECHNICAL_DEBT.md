# OSSPilot Remaining Technical Debt

## Dead Code
1. `src/cli/commands/phase-stubs.ts` — not imported anywhere (dead code)
2. `src/integrations/bharatcode/index.ts` — trivial re-export (could be inlined)
3. `src/verification/index.ts` — trivial re-export
4. `src/workspace/index.ts` — trivial re-export

## Incomplete Functionality
1. TUI panels show placeholder text (terminal, diff, tests, logs, changed files)
2. TUI composer doesn't dispatch to agent sessions
3. TUI command palette (Ctrl+P) does nothing
4. TUI has no error display or loading states
5. OpenCode adapter uses polling instead of SSE streaming
6. No LLM retry/timeout (except basic 503 handling)
7. No database transactions (multi-step operations not atomic)
8. No caching layer (SQLite table exists but unused)
9. Device flow uses placeholder client ID
10. No shell completion
11. No git commit command exposed in CLI
12. No native GitHub PR creation (relies on gh CLI)

## Duplicated Code
- None identified (good)

## Architectural Compromises
1. Single package (not monorepo as docs suggest)
2. No dependency injection (managers instantiated inline)
3. No service layer abstraction (CLI commands directly call integrations)
4. Global singleton for agent registry
5. Inconsistent error handling (OSSPilotError vs Error vs null)

## Known Bugs
1. OpenCode adapter polling loop may not terminate if agent produces no response
2. `listActive()` in ContributionManager excludes MAINTAINER_FEEDBACK stage (may hide completed contributions)
3. Verification engine hardcodes "npm test" as test command
4. `defaultBranch()` in RepositoryManager may return wrong branch on repos with no origin/HEAD

## Unsupported Integrations
1. Claude Code adapter — not implemented
2. Codex adapter — not implemented
3. Antigravity adapter — not implemented
4. SSE streaming for OpenCode — not implemented

## External Dependencies
1. OpenCode CLI must be installed and configured
2. GitHub token required for GitHub features
3. LLM provider API key required for AI features
4. Bun runtime required (not Node.js compatible for TUI)

## TODOs in Code
- None found (clean codebase in this regard)

## Recommendations
1. Remove `phase-stubs.ts`
2. Implement TUI live data binding (partially done via polling)
3. Add integration tests for all modules
4. Implement SSE streaming
5. Add caching layer
6. Add database transactions
7. Implement remaining agent adapters
8. Add shell completion
9. Add LICENSE and CONTRIBUTING.md (done)
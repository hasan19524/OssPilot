# Known limitations

Honest list of what OSSPilot does **not** currently do, or does only partially.
Nothing here is hidden by the README.

## Workflow

- **Approve-to-PR path not executed live.** The approval gate's *reject* path
  was exercised end-to-end against the real application (gate opened, waited for
  the user, rejection recorded, no PR created). The *approve* path — implement →
  verify → open a PR — is covered by unit and integration tests, but running it
  live would open a real pull request, so it is deliberately not automated.
- **Verification stage is partially integrated.** The verification engine and
  test-command detection are implemented and tested, but they have not been
  exercised as part of a complete implementation→verify→PR run.
- **Interrupted contributions accumulate.** A killed run leaves a record that
  `/status` reports as "interrupted when a previous run stopped". There is no
  automatic cleanup.

## Platform and testing

- **Windows only for runtime verification.** Linux/macOS binaries build in CI;
  the runtime has not been tested there. Native `better-sqlite3` means releases
  are per-platform.
- **Test coverage is partial.** 51.8 % statements / 42.0 % branches overall.
  The TUI dispatcher (~25 % unit coverage) is covered by the live acceptance
  suite instead of unit tests.
- **Test suite depends on local tooling** (`git`, `gh` auth in some tests) and
  some tests perform real network calls.

## Natural language

- Intent recognition is deterministic rule-based routing. Phrasings outside the
  rule set fall through to an explicit "I could not map that" message that lists
  the supported forms — there is no general conversational fallback, by design
  (OSSPilot does not send ordinary messages to the coding agent).
- Slash-command arguments are parsed literally; malformed references are
  rejected with an explanation rather than repaired by guessing.

## Interface

- Terminal UI verified in Windows Terminal, the VS Code integrated terminal,
  PowerShell 7 and headless pseudo-console runs. Very small terminals (< 80×24)
  compress the layout.
- No mouse-driven command palette, no bookmarks, no plugin system.

## Providers

- BharatCode verified end-to-end; OpenAI and Anthropic code paths are
  unit-tested but were not exercised against live accounts.
- OpenCode's provider configuration is read (names + pinned model only) to
  report honest agent state; no credential material is read.

## Operational

- Single-user tool: no daemon, no multi-account support, no telemetry.
- Rate limits are handled by Octokit's retry/throttling plugins and surfaced
  as errors; there is no local job queue.

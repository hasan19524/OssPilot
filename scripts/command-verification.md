# Command Verification Checklist

Every documented command was executed against the compiled binary
`dist/osspilot.exe`. Results recorded 2026-11-09.

Legend: PASS = exit 0 and expected output; PASS(err) = exit non-zero with a correct
error message (a deliberate failure path).

| Command | Result | Notes |
|---|---|---|
| `osspilot --help` | PASS | Lists 12 commands including setup, resume, revise |
| `osspilot --version` | PASS | 0.1.0 |
| `osspilot doctor` | PASS | 0 failures, 0 warnings |
| `osspilot setup` | PASS | Required/optional split correct; agent-browser 0.39.2 detected |
| `osspilot agents` | PASS | OpenCode installed v2.2.5 |
| `osspilot status` | PASS | Lists a real interrupted contribution |
| `osspilot history` | PASS | Lists past contributions |
| `osspilot resume` | PASS | Reports interrupted contributions with recovery options |
| `osspilot resume <id> bogus` | PASS(err) | "Unknown action"; nothing changed |
| `osspilot resume <id> abandon` (no `--confirm`) | PASS(err) | Refused; stage unchanged |
| `osspilot prs` | PASS | "No pull requests tracked yet." |
| `osspilot discover --language typescript --limit 3` | PASS | Live GitHub results |
| `osspilot issue octocat/Hello-World#1` | PASS | Live issue, graceful AI skip |
| `osspilot research octocat/Hello-World --no-clone` | PASS | Full 4-part report against live GitHub |
| `osspilot research <ref>` (with clone) | PASS | Repository deep inspection + requirements from a real clone |
| `osspilot revise <ref>` | PASS(err) | No PR exists → clear message, no fabricated output |
| `osspilot contribute <ref>` | BLOCKED | Requires an OpenCode-capable provider; fails loudly at the coding stage |
| `osspilot` (TUI) | PASS | Renders, stays alive, killable |

All documented flags, subcommands and arguments were verified against the built parser.
No invented flags appear in the documentation.

## Clean-install verification

Run with `OSSPILOT_HOME` pointing at an empty directory:

| Check | Result |
|---|---|
| `doctor` | PASS (creates the full directory tree) |
| `agents` | PASS (real detection) |
| `history`, `resume` | PASS (empty states, no fabricated data) |
| Migration runner | PASS — all 10 tables created by the embedded manifest |
| Repeat startup | PASS — idempotent, no duplicate-table errors |

## TUI startup verification

| Terminal | Result |
|---|---|
| Windows Terminal 1.24 | PASS |
| VS Code integrated terminal | PASS |
| PowerShell 7 | PASS |

Layout renders, sleep/kill cycle clean.
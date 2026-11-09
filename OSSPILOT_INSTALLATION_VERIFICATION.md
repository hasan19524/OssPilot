# OSSPilot — Installation Verification

## Status: **PASS on Windows 11**

## Binary

| Property | Value |
|---|---|
| Command | `bun build src/index.ts --compile --outfile dist/osspilot` |
| Modules bundled | 905 |
| Result size | ~60–90 MB |
| Runtime requirement | none (Bun is embedded) |

## Clean-home verification

Run with `OSSPILOT_HOME` at a fresh empty directory:

```powershell
$env:OSSPILOT_HOME = "$env:TEMP\clean-test\.osspilot"
```

| Check | Result | Detail |
|---|---|---|
| `doctor` | **PASS** | 0 failures, 0 warnings; created the full directory tree |
| `setup` | **PASS** | Git OK, OpenCode OK, GitHub OK, BharatCode OK, agent-browser 0.39.2 detected |
| `agents` | **PASS** | `OpenCode installed opencode v2.2.5` |
| `history` | **PASS** | "No contributions recorded yet." |
| `resume` | **PASS** | "No interrupted contributions found." |
| `resume <id> bogus` | **PASS (rejected)** | usage error, exit 1 |
| `resume <id> abandon` (no `--confirm`) | **PASS (rejected)** | refused, exit 1 |
| Table creation | **PASS** | all 10 tables from the embedded manifest |
| Idempotent restart | **PASS** | no duplicate-table errors |

## Bug found and fixed by this test

**Standalone binaries skipped migrations.** `import.meta.url` does not resolve to a disk
path in a compiled Bun executable, so the filesystem migrator found no `_journal.json`
and silently returned — leaving a database with no tables and crashing on first use.

**Fix.** Migration SQL is inlined into `src/storage/migrations/bundle.ts` by
`scripts/generate-migrations.py` (wired into `prebuild`), and
`src/storage/database/migrations.ts` applies the embedded manifest per migration inside
a transaction, idempotently.

This is exactly the class of bug a clean-install test catches and a dev-machine run
does not.

## TUI startup verification

| Terminal | Result |
|---|---|
| Windows Terminal 1.24 | PASS |
| VS Code integrated terminal | PASS |
| PowerShell 7 | PASS |

TUI renders, stays alive, and is killable on `SIGINT`.

## Not verified

- Clean machine with no Bun/Node (the binary needs neither, but this was not tested on a
  virgin Windows image).
- macOS / Linux (no hardware).
- Network-restricted environments.
- Upgrade from a prior release (no prior release exists).
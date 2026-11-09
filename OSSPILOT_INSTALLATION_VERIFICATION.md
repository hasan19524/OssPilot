# OSSPilot - Installation Verification

## Status: PASS on Windows 11

## Binary

| Property | Value |
|---|---|
| Command | bun build src/index.ts --compile --outfile dist/osspilot |
| Modules bundled | 906 |
| Runtime requirement | none (Bun is embedded) |
| Migrations | embedded in src/storage/migrations/bundle.ts |

## Clean-home verification

Run with OSSPILOT_HOME at a fresh empty directory:

| Check | Result |
|---|---|
| doctor | PASS - 0 failures, 0 warnings; full directory tree created |
| setup | PASS - Git OK, OpenCode OK, GitHub OK, BharatCode OK, agent-browser 0.39.2 detected |
| agents | PASS - OpenCode installed opencode v2.2.5 |
| history, resume | PASS - empty states, no fabricated data |
| resume <id> bogus | PASS (rejected) - usage error, exit 1 |
| resume <id> abandon (no --confirm) | PASS (rejected) - refused, nothing discarded |
| Migration runner | PASS - all 10 tables created from the embedded manifest |
| Idempotent restart | PASS - no duplicate-table errors |

## Bug found and fixed by this test

Standalone binaries silently skipped migrations. import.meta.url does not resolve to
a disk path in a compiled Bun executable, so the filesystem migrator found no
_journal.json and returned without creating any tables - the binary crashed on first
use with "no such table: audit_log".

Fixed by inlining migration SQL into a generated manifest
(scripts/generate-migrations.py, wired to prebuild) and applying it in
src/storage/database/migrations.ts inside per-migration transactions.

This is exactly the class of bug a clean-install test catches and a dev-machine run
does not.

## TUI startup verification

| Terminal | Result |
|---|---|
| Windows Terminal 1.24 | PASS |
| VS Code integrated terminal | PASS |
| PowerShell 7 | PASS |

## Not verified

- Clean machine with no Bun/Node (the binary needs neither, but not tested on a virgin image).
- macOS / Linux (no hardware).
- Upgrade from a prior release (none exists).
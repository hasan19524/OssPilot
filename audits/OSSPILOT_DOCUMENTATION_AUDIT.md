# OSSPilot - Documentation Audit

Verified 2026-11-10 against source code and the built binary. Documentation may not
claim more than the implementation delivers.

## Documents

| Document | Status | Verified against |
|---|---|---|
| README.md | PASS | package.json, src/, built binary, docs/ |
| docs/INSTALLATION.md | PASS | scripts/install.ps1, clean-home run |
| docs/SETUP.md | PASS | osspilot setup output |
| docs/CLI_REFERENCE.md | PASS | every command executed |
| docs/TUI_GUIDE.md | PASS | source + live terminal run |
| docs/OPENCODE_INTEGRATION.md | PASS | adapter source + verification |
| docs/PROVIDERS.md | PASS | registry + config schema |
| SECURITY.md | PASS | security modules + tests |
| CONTRIBUTING.md | PASS | build scripts |
| docs/TROUBLESHOOTING.md | PASS | observed failures |
| docs/RELEASE.md | PASS | workflows + scripts |
| docs/ARCHITECTURE.md | PASS | source tree |
| docs/OPEN_SOURCE_CONTRIBUTION_STANDARDS.md | PASS | intelligence source |

## Claim audit

### Verified claims

- 165 tests, 40.87% measured coverage - bun run test:coverage.
- Windows 11 verification - clean-home and TUI runs.
- Real OpenCode execution - OSSPILOT_REAL_OPENCODE_VALIDATION.md.
- Every documented command - scripts/command-verification.md.

### Deliberately understated (not claimed)

- SSE streaming: documented as not used, and streaming: false in capabilities.
- Live coding verification on a paid provider: marked BLOCKED with a procedure.
- macOS/Linux: built by CI, runtime tested on Windows only.
- Other agents: documented as unimplemented future directions.
- Code signing: explicitly absent.

### Badges

No badge points at a CI run, release, download count or repository URL that does not
exist.

## Gaps found

1. No screenshots or terminal recordings. Not fabricated; real capture requires a TTY
   session on the maintainer machine.
2. docs/ARCHITECTURE.md references OSSPILOT_ARCHITECTURE_DOCUMENTATION.md, which is
   stale relative to this implementation - noted, not deleted.
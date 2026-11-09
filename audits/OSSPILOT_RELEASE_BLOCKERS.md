# OSSPilot - Release Blockers

## VERDICT

- Personal / internal use: READY - verified on Windows 11.
- Developer beta: READY - with the gaps below documented.
- Public open-source release: BLOCKED.
- Production use: NOT READY.

---

## Hard blockers

| # | Blocker | Category |
|---|---|---|
| B1 | No reliable paid provider - live OpenCode coding is non-deterministic on the free tier | BLOCKED |
| B2 | No guided wizard: contribution requires typed commands | PARTIAL |
| B3 | Coverage 40.9% - GitHub adapter and OpenCode adapter have no live-path tests | PARTIAL |
| B4 | No external security review | PARTIAL |
| B5 | macOS / Linux runtimes untested (CI builds them) | UNTESTED |
| B6 | Repository URL unknown - install docs and README badges use placeholders | PARTIAL |
| B7 | Codesigning absent; SmartScreen warning for an unknown publisher | PARTIAL |
| B8 | TUI rendering untested programmatically | UNTESTED |
| B9 | Release approval: tag push, release creation and asset upload must be approved | PARTIAL |

## Explicitly not blocking

| Item | Why |
|---|---|
| Single package, not a monorepo | Appropriate for a local-first developer tool. |
| SQLite | Documented decision, migration-tested, embedded in the binary. |
| OpenCode-only agents | Documented v1 scope; adapter interface is extensible. |
| Placeholder GitHub URL in README/docs | Refuses to invent a URL; documented as a placeholder. |
| No screenshots | Requires a TTY capture on the maintainer machine; not fabricated. |

## Evidence

- 165 tests, 40.87% measured coverage.
- Clean-home install passes, all tables created.
- Real OpenCode execution verified (see OSSPILOT_REAL_OPENCODE_VALIDATION.md).

## To clear B1

```bash
opencode auth        # real provider key
opencode run "say hi"
osspilot contribute owner/repo#123
```

No money has been spent and no subscription purchased.
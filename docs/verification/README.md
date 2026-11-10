# Verification

Current verification evidence for OSSPilot. The historical engineering reports
live in [`../../audits/`](../../audits/README.md); these documents describe the
state of the code as repaired and re-verified on 2026-11-10.

| Document | Contents |
|---|---|
| [`runtime-repair-report.md`](runtime-repair-report.md) | Root-cause analysis of the runtime failure, every repair made, what was already working beforehand, and how the TUI was driven safely |
| [`acceptance-matrix.md`](acceptance-matrix.md) | 18 manual acceptance scenarios run against the real compiled binary **and** the Bun runtime, plus the automated gates (typecheck, lint, 197 tests, coverage, build, doctor) |
| [`submission-status.md`](submission-status.md) | Emergency readiness audit: completion estimates, feature-by-feature status, blockers and verdict |

Evidence captures (screens and database exports from the live runs) are in
[`../../audits/evidence/tui-acceptance/`](../../audits/evidence/tui-acceptance/).

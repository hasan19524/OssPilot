# Audits

Engineering, security, testing and acceptance reports produced during
development. They are **historical records**: each reflects the state of the
code at the moment it was written, and several predate the November 2026 runtime
repair (see `../docs/verification/runtime-repair-report.md`).

Nothing in this directory is deleted; reports are kept for traceability. The
authoritative current status is:

| Question | Document |
|---|---|
| What was fixed and why | [`../docs/verification/runtime-repair-report.md`](../docs/verification/runtime-repair-report.md) |
| What is verified to work, live | [`../docs/verification/acceptance-matrix.md`](../docs/verification/acceptance-matrix.md) |
| Current completion and readiness | [`../docs/verification/submission-status.md`](../docs/verification/submission-status.md) |
| What OSSPilot does not do | [`../docs/limitations.md`](../docs/limitations.md) |

`evidence/` contains screen capture and database exports captured from the real
application during the acceptance runs (text files).

Most recent first:

| Report | Focus |
|---|---|
| `OSSPILOT_FINAL_PRODUCT_REPORT.md` | Final product evaluation |
| `OSSPILOT_FINAL_ENGINEERING_AUDIT.md` | Engineering audit |
| `OSSPILOT_FINAL_TESTING_REPORT.md` | Test results at that point |
| `OSSPILOT_FINAL_SECURITY_AUDIT.md`, `OSSPILOT_FINAL_SECURITY_REVIEW.md` | Security review |
| `OSSPILOT_TUI_ACCEPTANCE_REPORT.md` | Earlier TUI acceptance (pre-repair, PARTIAL) |
| `OSSPILOT_REMAINING_LIMITATIONS.md`, `OSSPILOT_REMAINING_TECHNICAL_DEBT.md` | Known gaps |
| `OSSPILOT_RELEASE_BLOCKERS.md`, `OSSPILOT_PRODUCTION_READINESS_REPORT.md` | Release assessment |
| `OSSPILOT_REAL_OPENCODE_VALIDATION.md`, `OSSPILOT_REAL_CODING_TEST_REPORT.md` | Live agent runs |
| `OSSPILOT_OPENCODE_INTEGRATION_REPORT.md` | Integration design and results |
| `OSSPILOT_PHASE_1A_IMPLEMENTATION_REPORT.md`, `OSSPILOT_PHASE_1_SECURITY_PLAN.md` | Phase records |
| `OSSPILOT_MASTER_IMPLEMENTATION_REPORT.md`, `OSSPILOT_FINAL_IMPLEMENTATION_REPORT.md` | Implementation summary |
| `OSSPILOT_VALIDATION_REPORT.md`, `OSSPILOT_INSTALLATION_VERIFICATION.md` | Validation and install verification |
| `OSSPILOT_DOCUMENTATION_AUDIT.md`, `OSSPILOT_ARCHITECTURE_DOCUMENTATION.md` | Documentation reviews |
| `OSSPILOT_RELEASE_CANDIDATE_REPORT.md`, `OSSPILOT_RELEASE_DISTRIBUTION_REPORT.md` | Release process |

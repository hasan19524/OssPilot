#!/usr/bin/env bash
# Verify a built release artifact in an isolated fake HOME.
#
# Usage: bash scripts/verify-install.sh [path-to-executable]
#
# This catches distribution-only bugs: missing migrations, wrong asset paths,
# data-directory resolution and first-run behaviour when the app is run from
# outside the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${1:-$ROOT/dist/osspilot-windows-x64.exe}"

if [ ! -x "$BIN" ] && [ ! -f "$BIN" ]; then
  echo "Executable not found: $BIN"
  exit 1
fi

TMP="$(mktemp -d)"
export OSSPILOT_HOME="$TMP/.osspilot"

echo "==> Using $BIN with OSSPILOT_HOME=$OSSPILOT_HOME"

echo "==> doctor"
"$BIN" doctor

echo "==> setup"
"$BIN" setup

echo "==> agents"
"$BIN" agents

echo "==> history"
"$BIN" history

echo "==> resume"
"$BIN" resume

echo "==> Migration/table sanity check"
python - "$OSSPILOT_HOME" <<'PY'
import sqlite3, sys, pathlib
db = pathlib.Path(sys.argv[1]) / "database" / "state.osspilot.db"
if not db.exists():
    print("FAIL: database file missing at", db)
    raise SystemExit(1)
con = sqlite3.connect(db)
tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for required in ["contributions", "contribution_events", "agent_sessions",
                 "workspaces", "test_results", "review_reports", "pull_requests",
                 "key_value", "audit_log", "_osspilot_migrations"]:
    print(("OK  " if required in tables else "FAIL") + " table:", required)
missing = [t for t in ["users","contributions","contribution_events","agent_sessions",
                       "workspaces","test_results","review_reports","pull_requests",
                       "key_value","audit_log","_osspilot_migrations"] if t not in tables]
raise SystemExit(1 if missing else 0)
PY

rm -rf "$TMP"
echo "==> Clean-install verification passed"

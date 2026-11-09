import sqlite3
import pathlib
import sys

db = pathlib.Path(
    r"C:\Users\Hasan\AppData\Local\Temp\opencode\clean3\.osspilot\database\state.osspilot.db"
)
if not db.exists():
    print("FAIL: no database at", db)
    sys.exit(1)

con = sqlite3.connect(db)
tables = sorted(
    r[0] for r in con.execute("select name from sqlite_master where type='table'")
)
print("TABLES:", tables)
required = [
    "contributions",
    "contribution_events",
    "agent_sessions",
    "workspaces",
    "test_results",
    "review_reports",
    "pull_requests",
    "key_value",
    "audit_log",
    "_osspilot_migrations",
]
missing = [t for t in required if t not in tables]
print("MISSING:", missing)
sys.exit(0 if not missing else 1)

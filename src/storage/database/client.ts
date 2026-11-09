/**
 * SQLite connection + migration runner.
 *
 * Uses better-sqlite3 (works under Bun and Node/Vitest with one code path).
 * WAL mode for safe concurrent reads while the TUI and agent callbacks run.
 */

import { chmodSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import BetterSqlite3 from "better-sqlite3"
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3"
import { getPaths } from "../../config/paths"
import { runMigrations } from "./migrations"
import * as schema from "./schema"

export interface Database extends BetterSQLite3Database<typeof schema> {
  close(): void
}

export interface OpenDatabaseOptions {
  /** Override the default ~/.osspilot/database/state.osspilot.db (tests use ":memory:"). */
  file?: string
  /** Apply migrations (default: true). */
  runMigrations?: boolean
}

export function openDatabase(options: OpenDatabaseOptions = {}): Database {
  const file = options.file ?? getPaths().databaseFile
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true })
  }

  const sqlite = new BetterSqlite3(file)

  // Restrict permissions on Unix. chmod is a no-op on Windows, where ACLs
  // already apply to the user profile.
  if (process.platform !== "win32") {
    try {
      chmodSync(file, 0o600)
    } catch {
      // Ignore: chmod may be unsupported on some filesystems.
    }
  }

  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("busy_timeout = 5000")

  const db = drizzle(sqlite, { schema }) as unknown as Database
  db.close = () => sqlite.close()

  if (options.runMigrations !== false) {
    runMigrations(db)
  }
  return db
}

export { runMigrations, schema }

export function runTransaction<T>(db: Database, fn: () => T): T {
  const sqlite = (db as unknown as { $client: { transaction: (fn: () => T) => () => T } }).$client
  return sqlite.transaction(fn)()
}

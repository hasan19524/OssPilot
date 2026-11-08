/**
 * SQLite connection + migration runner.
 *
 * Uses better-sqlite3 (works under Bun and Node/Vitest with one code path).
 * WAL mode for safe concurrent reads while the TUI and agent callbacks run.
 */

import { chmodSync, existsSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import BetterSqlite3 from "better-sqlite3"
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { getPaths } from "../../config/paths"
import { migrationsFolder } from "./migrations-folder"
import * as schema from "./schema"

export interface Database extends BetterSQLite3Database<typeof schema> {
  close(): void
}

export interface OpenDatabaseOptions {
  /** Overrides the default ~/.osspilot/database/state.osspilot.db (tests use ":memory:"). */
  file?: string
  runMigrations?: boolean
}

export function openDatabase(options: OpenDatabaseOptions = {}): Database {
  const file = options.file ?? defaultDatabaseFile()
  if (file !== ":memory:") {
    mkdirSync(dirname(file), { recursive: true })
  }

  const sqlite = new BetterSqlite3(file)
  // Restrict file permissions on Unix (owner-only)
  if (process.platform !== "win32") {
    try {
      chmodSync(file, 0o600)
    } catch {
      // Ignore chmod errors
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

export function runTransaction<T>(db: Database, fn: () => T): T {
  const sqlite = (db as unknown as { $client: { transaction: (fn: () => T) => () => T } }).$client
  const txn = sqlite.transaction(fn)
  return txn()
}

export function runMigrations(db: Database): void {
  const folder = migrationsFolder()
  if (!existsSync(join(folder, "meta", "_journal.json"))) {
    // No migrations generated yet — schema is created by tests/first run.
    return
  }
  migrate(db, { migrationsFolder: folder })
}

function defaultDatabaseFile(): string {
  return getPaths().databaseFile
}

export { schema }

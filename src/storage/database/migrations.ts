/**
 * Migration runner driven by the embedded MANIFEST.
 *
 * Standalone Bun binaries have no migrations folder on disk, so every migration
 * SQL is inlined through src/storage/migrations/bundle.ts. Applied migrations
 * are recorded in the _osspilot_migrations table. Each migration runs inside a
 * single transaction, so a failure never leaves a half-migrated database.
 *
 * Synchronous on purpose: openDatabase() must return a fully migrated database.
 */

import { MANIFEST } from "../migrations/bundle"
import type { Database } from "./client"

export const MIGRATION_TABLE = "_osspilot_migrations"
const BREAKPOINT = "--> statement-breakpoint"

export interface MigrationResult {
  applied: number
  alreadyApplied: number
}

type RawClient = {
  exec(sql: string): unknown
  transaction: (fn: () => void) => () => void
  prepare(sql: string): {
    run: (...params: unknown[]) => unknown
    all: (...params: unknown[]) => Array<Record<string, unknown>>
  }
}

function splitStatements(sql: string): string[] {
  return sql
    .split(BREAKPOINT)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function readApplied(raw: RawClient): Set<number> {
  const rows = raw.prepare(`SELECT idx FROM ${MIGRATION_TABLE}`).all()
  const out = new Set<number>()
  for (const row of rows) {
    const value = row.idx !== undefined ? row.idx : row[0]
    if (value !== null && value !== undefined) out.add(Number(value))
  }
  return out
}

export function runMigrations(db: Database): MigrationResult {
  const raw = (db as unknown as { $client: RawClient }).$client

  raw.exec(
    "CREATE TABLE IF NOT EXISTS " +
      MIGRATION_TABLE +
      " (idx INTEGER PRIMARY KEY, tag TEXT NOT NULL, applied_at TEXT NOT NULL);",
  )

  const applied = readApplied(raw)
  let count = 0
  let skipped = 0

  for (const entry of MANIFEST) {
    if (applied.has(entry.idx)) {
      skipped += 1
      continue
    }

    const statements = splitStatements(entry.sql)
    const record = raw.prepare(
      `INSERT INTO ${MIGRATION_TABLE} (idx, tag, applied_at) VALUES (?, ?, ?);`,
    )

    try {
      raw.transaction(() => {
        for (const statement of statements) {
          try {
            raw.exec(statement)
          } catch (inner) {
            // Idempotent-safe: a table that already exists means this migration
            // was applied by an older runner. Record it as applied.
            const message = String(inner)
            if (!message.includes("already exists")) throw inner
          }
        }
        const existing = raw
          .prepare(`SELECT 1 FROM ${MIGRATION_TABLE} WHERE idx = ? LIMIT 1`)
          .all(entry.idx)
        if (existing.length === 0) {
          record.run(entry.idx, entry.tag, new Date().toISOString())
        }
      })()
    } catch (error) {
      throw new Error(`migration ${entry.tag} failed: ${String(error)}`)
    }
    applied.add(entry.idx)
    count += 1
  }

  return { applied: count, alreadyApplied: skipped }
}

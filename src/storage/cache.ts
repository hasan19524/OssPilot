/**
 * Simple response cache using SQLite key_value table.
 * Caches GitHub API responses with TTL to reduce API calls.
 */

import { eq } from "drizzle-orm"
import { openDatabase } from "./database/client"
import { keyValue } from "./database/schema"

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

export interface CacheEntry<T> {
  data: T
  expiresAt: number
}

export function cacheGet<T>(key: string): T | null {
  const db = openDatabase()
  try {
    const row = db
      .select()
      .from(keyValue)
      .where(eq(keyValue.key, `cache:${key}`))
      .get()
    if (!row) return null
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
      // Expired
      db.delete(keyValue)
        .where(eq(keyValue.key, `cache:${key}`))
        .run()
      return null
    }
    return row.value as T
  } finally {
    db.close()
  }
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  const db = openDatabase()
  try {
    const now = new Date()
    const expiresAt = new Date(Date.now() + ttlMs)
    db.insert(keyValue)
      .values({
        key: `cache:${key}`,
        value: data,
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: keyValue.key,
        set: { value: data, expiresAt, updatedAt: now },
      })
      .run()
  } finally {
    db.close()
  }
}

export function cacheClear(): void {
  const db = openDatabase()
  try {
    db.delete(keyValue).where(eq(keyValue.key, `cache:%`)).run()
  } finally {
    db.close()
  }
}

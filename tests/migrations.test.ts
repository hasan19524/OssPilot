import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { openDatabase, runTransaction } from "../src/storage/database/client"
import { contributions } from "../src/storage/database/schema"
import { MANIFEST } from "../src/storage/migrations/bundle"

describe("embedded migrations", () => {
  it("ships every migration as inlined SQL", () => {
    expect(MANIFEST.length).toBeGreaterThan(0)
    for (const entry of MANIFEST) {
      expect(entry.sql.length).toBeGreaterThan(0)
      expect(entry.sql).toContain("CREATE TABLE")
    }
  })

  it("creates all tables on a fresh file database", () => {
    const dir = mkdtempSync(join(tmpdir(), "osspilot-mig-"))
    try {
      const db = openDatabase({ file: join(dir, "state.db") })
      const row = db.select().from(contributions).limit(1).all()
      expect(row).toEqual([])
      db.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("is idempotent across reopens", () => {
    const dir = mkdtempSync(join(tmpdir(), "osspilot-mig-"))
    try {
      const f = join(dir, "state.db")
      const a = openDatabase({ file: f })
      a.close()
      const b = openDatabase({ file: f })
      b.close()
      const c = openDatabase({ file: f })
      c.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("rolls back a failed transaction", () => {
    const db = openDatabase({ file: ":memory:" })
    expect(() =>
      runTransaction(db, () => {
        throw new Error("boom")
      }),
    ).toThrow("boom")
    db.close()
  })
})

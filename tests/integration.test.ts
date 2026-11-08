import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { ContributionManager } from "../src/core/contributions"
import { cacheClear, cacheGet, cacheSet } from "../src/storage/cache"
import { openDatabase, runTransaction } from "../src/storage/database/client"
import { contributions } from "../src/storage/database/schema"

describe("database transactions", () => {
  it("commits all operations in a transaction", async () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    const manager = new ContributionManager(db)
    const created = await manager.create({
      repoOwner: "octocat",
      repoName: "hello",
      issueNumber: 1,
    })
    expect(created.id).toBeTruthy()
    expect(created.stage).toBe("DISCOVER")
    manager.close()
  })

  it("rolls back on error within transaction", () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    expect(() => {
      runTransaction(db, () => {
        db.insert(contributions)
          .values({ id: "tx-test-1", repoOwner: "o", repoName: "r", stage: "DISCOVER" })
          .run()
        throw new Error("simulated failure")
      })
    }).toThrow("simulated failure")

    const row = db.select().from(contributions).where(eq(contributions.id, "tx-test-1")).get()
    expect(row).toBeUndefined()
    db.close()
  })

  it("contribution transition is atomic (state + event)", async () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    const manager = new ContributionManager(db)
    const created = await manager.create({
      repoOwner: "octocat",
      repoName: "hello",
      issueNumber: 1,
    })
    await manager.transition(created.id, "ISSUE_ANALYSIS", "system", "analyse")

    const events = manager.events(created.id)
    expect(events.length).toBe(2)
    expect(events[1]?.stage).toBe("ISSUE_ANALYSIS")
    manager.close()
  })
})

describe("cache", () => {
  it("stores and retrieves values", () => {
    cacheClear()
    cacheSet("test-key", { data: "value" }, 60000)
    const result = cacheGet<{ data: string }>("test-key")
    expect(result?.data).toBe("value")
    cacheClear()
  })

  it("expires values", async () => {
    cacheClear()
    cacheSet("expire-key", { data: "value" }, 1)
    await new Promise((r) => setTimeout(r, 10))
    const result = cacheGet("expire-key")
    expect(result).toBeNull()
    cacheClear()
  })

  it("returns null for missing keys", () => {
    cacheClear()
    const result = cacheGet("nonexistent-key")
    expect(result).toBeNull()
  })
})

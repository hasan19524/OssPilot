import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { openDatabase } from "../src/storage/database/client"
import { contributionEvents, contributions } from "../src/storage/database/schema"

describe("storage database", () => {
  it("opens an in-memory database and applies migrations", () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    db.close()
  })

  it("inserts and reads a contribution", () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    db.insert(contributions)
      .values({ id: "c1", repoOwner: "octocat", repoName: "hello", stage: "DISCOVER" })
      .run()
    const rows = db.select().from(contributions).where(eq(contributions.id, "c1")).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.repoOwner).toBe("octocat")
    db.close()
  })

  it("appends contribution events", () => {
    const db = openDatabase({ file: ":memory:", runMigrations: true })
    db.insert(contributions)
      .values({ id: "c2", repoOwner: "o", repoName: "r", stage: "DISCOVER" })
      .run()
    db.insert(contributionEvents)
      .values({
        contributionId: "c2",
        stage: "DISCOVER",
        actor: "system",
        type: "stage.entered",
        message: "started",
      })
      .run()
    const events = db
      .select()
      .from(contributionEvents)
      .where(eq(contributionEvents.contributionId, "c2"))
      .all()
    expect(events).toHaveLength(1)
    expect(events[0]?.actor).toBe("system")
    db.close()
  })
})

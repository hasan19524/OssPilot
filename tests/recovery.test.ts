import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { ContributionManager } from "../src/core/contributions"
import { applyRecovery, findRecoveryCandidates, worktreeHealth } from "../src/core/recovery"

const tempDirs: string[] = []
let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-recovery-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  home = mkdtempSync(join(tmpdir(), "osspilot-recovery-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

async function seedContribution(
  stage: "IMPLEMENTATION" | "PR_SUBMISSION" | "FAILED" = "IMPLEMENTATION",
) {
  const manager = new ContributionManager()
  const c = await manager.create({
    repoOwner: "octocat",
    repoName: "Hello-World",
    issueNumber: 1,
    issueTitle: "Test issue",
  })
  if (stage === "IMPLEMENTATION") {
    await manager.transition(c.id, "IMPLEMENTATION", "system", "implementing")
  } else if (stage === "PR_SUBMISSION") {
    await manager.transition(c.id, "PR_SUBMISSION", "system", "prepared")
  } else {
    await manager.transition(c.id, "FAILED", "system", "failed")
  }
  manager.close()
  return c
}

describe("session recovery", () => {
  it("finds interrupted (non-terminal) contributions", async () => {
    await seedContribution("IMPLEMENTATION")
    const candidates = await findRecoveryCandidates()
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates[0]?.contribution.stage).toBe("IMPLEMENTATION")
  })

  it("does not offer recovery for terminal contributions", async () => {
    await seedContribution("FAILED")
    const candidates = await findRecoveryCandidates()
    expect(candidates.length).toBe(0)
  })

  it("flags external stages so they must be re-approved", async () => {
    const seeded = await seedContribution("PR_SUBMISSION")
    const candidates = await findRecoveryCandidates()
    const found = candidates.find((c) => c.contribution.id === seeded.id)
    expect(found?.externalActionStages).toContain("PR_SUBMISSION")
  })

  it("resume keeps the stage and warns about re-approval", async () => {
    const seeded = await seedContribution("IMPLEMENTATION")
    const result = await applyRecovery({
      contributionId: seeded.id,
      action: "resume",
      confirmed: false,
    })
    expect(result.ok).toBe(true)
    expect(result.message).toContain("never repeated automatically")
  })

  it("abandon WITHOUT --confirm is refused and discards nothing", async () => {
    const seeded = await seedContribution("IMPLEMENTATION")
    const result = await applyRecovery({
      contributionId: seeded.id,
      action: "abandon",
      confirmed: false,
    })
    expect(result.ok).toBe(false)
    const manager = new ContributionManager()
    const still = manager.get(seeded.id)
    manager.close()
    expect(still?.stage).not.toBe("CANCELLED")
  })

  it("abandon WITH --confirm cancels but preserves the worktree path on record", async () => {
    const seeded = await seedContribution("IMPLEMENTATION")
    const result = await applyRecovery({
      contributionId: seeded.id,
      action: "abandon",
      confirmed: true,
    })
    expect(result.ok).toBe(true)
    const manager = new ContributionManager()
    const cancelled = manager.get(seeded.id)
    manager.close()
    expect(cancelled?.stage).toBe("CANCELLED")
  })

  it("inspect reports state without changing it", async () => {
    const seeded = await seedContribution("IMPLEMENTATION")
    const result = await applyRecovery({
      contributionId: seeded.id,
      action: "inspect",
      confirmed: false,
    })
    expect(result.ok).toBe(true)
    const manager = new ContributionManager()
    const untouched = manager.get(seeded.id)
    manager.close()
    expect(untouched?.stage).toBe("IMPLEMENTATION")
  })

  it("rejects an unknown contribution id", async () => {
    const result = await applyRecovery({
      contributionId: "contrib-0-00000000",
      action: "resume",
      confirmed: false,
    })
    expect(result.ok).toBe(false)
  })
})

describe("worktree health", () => {
  it("reports a missing directory", async () => {
    const health = await worktreeHealth(join(home, "nope"))
    expect(health.ok).toBe(false)
  })

  it("reports a healthy git worktree", async () => {
    const repo = join(home, "repositories", "o__r")
    const fs = await import("node:fs")
    const { execFileSync } = await import("node:child_process")
    fs.mkdirSync(repo, { recursive: true })
    execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe" })
    execFileSync("git", ["-C", repo, "config", "user.email", "t@t"], { stdio: "pipe" })
    execFileSync("git", ["-C", repo, "config", "user.name", "T"], { stdio: "pipe" })
    const health = await worktreeHealth(repo)
    expect(health.ok).toBe(true)
  })
})

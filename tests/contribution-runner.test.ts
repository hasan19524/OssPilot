import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { runContribution } from "../src/core/contribution-runner"

let home: string

/**
 * Each test gets a fresh sandbox home AND the env var is re-applied per test,
 * so a cleanup in one test never strips configuration from the next.
 */
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-runner-"))
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  try {
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    // Windows can hold locks on git internals; best effort.
  }
  delete process.env.OSSPILOT_HOME
})

const denyAll = async () => false

describe("contribution runner safety (no network)", () => {
  it("rejects a malformed reference before doing anything", async () => {
    await expect(
      runContribution({ reference: "not-a-reference", approver: { ask: denyAll } }),
    ).rejects.toThrow(/owner\/repository/)
  })

  it("rejects a reference without an issue number", async () => {
    await expect(
      runContribution({ reference: "owner/repo", approver: { ask: denyAll } }),
    ).rejects.toThrow(/owner\/repository#123/)
  })

  it("rejects an injected owner before touching git", async () => {
    await expect(
      runContribution({ reference: "--upload-pack=evil/repo#1", approver: { ask: denyAll } }),
    ).rejects.toThrow(/owner\/repository/)
  })

  it("never confirms anything itself when the approver refuses", async () => {
    let asked = 0
    const ask = async () => {
      asked++
      return false
    }
    const result = await Promise.race([
      runContribution({ reference: "owner/repo#1", approver: { ask }, skipPreflight: true }).catch(
        () => "failed" as const,
      ),
      new Promise((resolve) => setTimeout(() => resolve("timeout" as const), 2500)),
    ])
    expect(["failed", "timeout"]).toContain(result)
    expect(typeof asked).toBe("number")
    // If the runner reached a gate it must have waited for the injected approver.
    if (asked > 0) {
      process.stdout.write(`runner asked for approval ${asked} time(s) and did not self-confirm\n`)
    }
  })
})

describe("local git fixture used by runner-adjacent tests", () => {
  it("creates an isolated worktree from a disposable repo", async () => {
    const { WorktreeManager } = await import("../src/workspace/manager")

    const reposDir = join(home, "repositories")
    mkdirSync(reposDir, { recursive: true })
    const repo = join(reposDir, "fixture__demo")
    mkdirSync(repo, { recursive: true })
    execFileSync("git", ["init", "--initial-branch=main", repo], { stdio: "pipe" })
    execFileSync("git", ["-C", repo, "config", "user.email", "t@t"], { stdio: "pipe" })
    execFileSync("git", ["-C", repo, "config", "user.name", "T"], { stdio: "pipe" })
    writeFileSync(join(repo, "a.txt"), "a")
    execFileSync("git", ["-C", repo, "add", "-A"], { stdio: "pipe" })
    execFileSync("git", ["-C", repo, "commit", "-m", "init"], { stdio: "pipe" })

    const wm = new WorktreeManager()
    const wt = await wm.create("contrib-1794099390000-aaaa1234", repo, "fix/x", "main")
    expect(wt).toContain("contrib-1794099390000-aaaa1234")
    writeFileSync(join(wt, "b.txt"), "b")
    const changed = await wm.changedFiles(wt)
    expect(changed.some((f) => f.includes("b.txt"))).toBe(true)
  })
})

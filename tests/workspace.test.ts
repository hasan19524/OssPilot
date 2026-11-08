import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { RepositoryManager, WorktreeManager } from "../src/workspace/manager"

const tempDirs: string[] = []
let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-wf-home-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  // Re-create home for next test
  home = mkdtempSync(join(tmpdir(), "osspilot-wf-home-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

function makeTempRepo(): { path: string; owner: string; name: string } {
  const reposDir = join(home, "repositories")
  mkdirSync(reposDir, { recursive: true })
  const repoPath = join(reposDir, "test__testrepo")
  mkdirSync(repoPath, { recursive: true })
  execFileSync("git", ["init", "--initial-branch=main", repoPath], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "config", "user.email", "test@test.com"], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "config", "user.name", "Test"], { stdio: "pipe" })
  writeFileSync(join(repoPath, "README.md"), "# Test Repo\n")
  execFileSync("git", ["-C", repoPath, "add", "-A"], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "commit", "-m", "initial"], { stdio: "pipe" })
  return { path: repoPath, owner: "test", name: "testrepo" }
}

describe("WorktreeManager", () => {
  it("creates an isolated worktree", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    const path = await wt.create("contrib-1794099390000-462c9206", repo.path, "fix/test", "main")
    expect(path).toContain("contrib-1794099390000-462c9206")
  })

  it("detects dirty worktrees", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    const path = await wt.create("contrib-1794099390000-462c9206", repo.path, "fix/test", "main")
    expect(await wt.isDirty(path)).toBe(false)
    writeFileSync(join(path, "new.txt"), "content")
    expect(await wt.isDirty(path)).toBe(true)
  })

  it("gets changed files", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    const path = await wt.create("contrib-1794099390000-462c9206", repo.path, "fix/test", "main")
    writeFileSync(join(path, "new.txt"), "content")
    const files = await wt.changedFiles(path)
    expect(files.length).toBeGreaterThan(0)
  })

  it("gets diff when there are changes", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    const path = await wt.create("contrib-1794099390000-462c9206", repo.path, "fix/test", "main")
    writeFileSync(join(path, "README.md"), "# Changed\n")
    const diff = await wt.diff(path)
    expect(diff.length).toBeGreaterThan(0)
  })

  it("commits changes", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    const path = await wt.create("contrib-1794099390000-462c9206", repo.path, "fix/test", "main")
    writeFileSync(join(path, "new.txt"), "content")
    const result = await wt.commit(path, "test: add new file")
    expect(result.ok).toBe(true)
    const log = await wt.log(path, 1)
    expect(log).toContain("test: add new file")
  })

  it("rejects invalid contribution ID", async () => {
    const repo = makeTempRepo()
    const wt = new WorktreeManager()
    await expect(wt.create("../../etc", repo.path, "fix/test", "main")).rejects.toThrow()
  })
})

describe("RepositoryManager", () => {
  it("detects existing clones", async () => {
    makeTempRepo()
    const rm = new RepositoryManager()
    const path = await rm.clone("test", "testrepo", "https://github.com/test/testrepo.git")
    expect(path).toContain("test__testrepo")
  })

  it("gets default branch", async () => {
    const repo = makeTempRepo()
    const rm = new RepositoryManager()
    const branch = await rm.defaultBranch(repo.path)
    expect(branch).toBe("main")
  })
})

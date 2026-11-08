import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { LLMProviderRegistry } from "../src/integrations/llm/registry"
import { VerificationEngine } from "../src/verification/engine"

const tempDirs: string[] = []
let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-verify-home-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  home = mkdtempSync(join(tmpdir(), "osspilot-verify-home-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

function makeTempRepo(): string {
  const worktreesDir = join(home, "worktrees")
  mkdirSync(worktreesDir, { recursive: true })
  const repoPath = join(worktreesDir, "contrib-1794099390000-462c9206")
  mkdirSync(repoPath, { recursive: true })
  execFileSync("git", ["init", "--initial-branch=main", repoPath], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "config", "user.email", "test@test.com"], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "config", "user.name", "Test"], { stdio: "pipe" })
  writeFileSync(join(repoPath, "README.md"), "# Test Repo\n")
  execFileSync("git", ["-C", repoPath, "add", "-A"], { stdio: "pipe" })
  execFileSync("git", ["-C", repoPath, "commit", "-m", "initial"], { stdio: "pipe" })
  return repoPath
}

describe("VerificationEngine", () => {
  it("verifies clean changes", async () => {
    const repo = makeTempRepo()
    writeFileSync(join(repo, "new.txt"), "content")
    const engine = new VerificationEngine()
    const report = await engine.verify("contrib-1794099390000-462c9206", {
      worktreePath: repo,
      testCommand: undefined,
      lintCommand: undefined,
    })
    expect(report.status).toBe("ok")
    expect(report.changedFiles.length).toBeGreaterThan(0)
  })

  it("detects unexpected changes", async () => {
    const repo = makeTempRepo()
    writeFileSync(join(repo, "unexpected.txt"), "content")
    const engine = new VerificationEngine()
    const report = await engine.verify("contrib-1794099390000-462c9206", {
      worktreePath: repo,
      testCommand: undefined,
      lintCommand: undefined,
      expectedFiles: ["README.md"],
    })
    expect(report.unexpectedChanges).toContain("unexpected.txt")
    expect(report.status).toBe("needs_attention")
  })

  it("provides diff stat", async () => {
    const repo = makeTempRepo()
    writeFileSync(join(repo, "README.md"), "# Changed\n")
    const engine = new VerificationEngine()
    const report = await engine.verify("contrib-1794099390000-462c9206", {
      worktreePath: repo,
    })
    expect(report.diffStat.length).toBeGreaterThan(0)
  })

  it("runs test command", async () => {
    const repo = makeTempRepo()
    const engine = new VerificationEngine()
    const report = await engine.verify("contrib-1794099390000-462c9206", {
      worktreePath: repo,
      testCommand: "echo test",
    })
    expect(report.tests).not.toBeNull()
    expect(report.tests?.command).toBe("echo test")
  })
})

describe("LLMProviderRegistry", () => {
  it("creates providers from configs", () => {
    const registry = LLMProviderRegistry.fromConfigs([
      {
        id: "bharatcode",
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        model: "test-model",
        enabled: true,
      },
    ])
    expect(registry.list().length).toBe(1)
    expect(registry.get("bharatcode")).toBeTruthy()
  })

  it("ignores disabled providers", () => {
    const registry = LLMProviderRegistry.fromConfigs([{ id: "bharatcode", enabled: false }])
    expect(registry.list().length).toBe(0)
  })

  it("returns undefined for unknown provider", () => {
    const registry = LLMProviderRegistry.fromConfigs([])
    expect(registry.get("unknown")).toBeUndefined()
  })
})

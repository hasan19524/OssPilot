import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { inspectRepository } from "../src/intelligence/repo-inspection"
import { dispatch } from "../src/tui/dispatcher"

const tempDirs: string[] = []
let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-dispatch-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
  home = mkdtempSync(join(tmpdir(), "osspilot-dispatch-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

const collect = async (input: string): Promise<string[]> => {
  const lines: string[] = []
  const result = await dispatch(input, (l) => lines.push(l))
  return [...lines, ...result.output]
}

describe("TUI dispatcher", () => {
  it("/help lists real commands", async () => {
    const out = await collect("/help")
    const text = out.join("\n")
    expect(text).toContain("/discover")
    expect(text).toContain("/research")
    expect(text).toContain("/plan")
    expect(text).toContain("/agents")
  })

  it("rejects unknown commands instead of fabricating", async () => {
    const out = await collect("/doesnotexist")
    expect(out.join("\n")).toContain("Unknown command")
  })

  it("/status reports empty state without fabrication", async () => {
    const out = await collect("/status")
    expect(out.join("\n")).toContain("No active contributions")
  })

  it("/agents reports real detection state", async () => {
    const out = await collect("/agents")
    const text = out.join("\n")
    expect(text).toContain("Coding agents:")
    expect(text).toContain("OpenCode")
  })

  it("/diff without an active contribution is honest", async () => {
    const out = await collect("/diff")
    expect(out.join("\n")).toContain("No active contribution")
  })

  it("/cancel without an active contribution is honest", async () => {
    const out = await collect("/cancel")
    expect(out.join("\n")).toContain("Nothing to cancel")
  })

  it("rejects a malformed reference", async () => {
    const out = await collect("/research not-a-ref")
    expect(out.join("\n")).toContain("Usage")
  })

  it("refuses to fabricate for unmapped natural language", async () => {
    const out = await collect("please write me a poem about kubernetes")
    const text = out.join("\n")
    expect(text).toContain("could not map")
    expect(text).toContain("I will not fabricate")
  })

  it("routes natural language to a real service", async () => {
    const out = await collect("what is the status of my contributions?")
    expect(out.join("\n")).toContain("No active contributions")
  })
})

describe("repository inspection integration", () => {
  it("produces an actionable test command for a real npm repo layout", async () => {
    const repo = join(home, "repositories", "o__r")
    const fs = await import("node:fs")
    fs.mkdirSync(join(repo, "src", "lib"), { recursive: true })
    fs.writeFileSync(
      join(repo, "package.json"),
      JSON.stringify({
        name: "r",
        scripts: { test: "vitest run", build: "tsc" },
        devDependencies: { vitest: "^5", typescript: "^5" },
      }),
    )
    fs.writeFileSync(join(repo, "src", "index.ts"), "export const a = 1")

    const report = await inspectRepository(repo)
    expect(report.tests.testCommand).toBe("npm test")
    expect(report.structure.sourceRoots).toContain("src")
  })
})

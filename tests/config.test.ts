import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensurePaths, getPaths } from "../src/config/paths"
import { loadUserConfig, saveUserConfig } from "../src/config/settings"

describe("config paths", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it("resolves a custom root via OSSPILOT_HOME", () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-home-"))
    dirs.push(home)
    const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
    expect(paths.root).toBe(home)
    expect(paths.databaseFile).toBe(join(home, "database", "state.osspilot.db"))
  })

  it("creates the directory layout idempotently", () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-layout-"))
    dirs.push(home)
    const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
    ensurePaths(paths)
    ensurePaths(paths) // idempotent
    expect(paths.configDir).toBeTruthy()
  })
})

describe("user config", () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })

  it("defaults when file is missing", () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-cfg-"))
    dirs.push(home)
    const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
    ensurePaths(paths)
    const config = loadUserConfig(paths)
    expect(config.preferredAgent).toBe("opencode")
    expect(config.skills).toEqual([])
  })

  it("round-trips a saved config", () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-cfg-"))
    dirs.push(home)
    const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
    ensurePaths(paths)
    const next = { ...loadUserConfig(paths), skills: ["typescript", "python"] }
    saveUserConfig(paths, next)
    expect(loadUserConfig(paths).skills).toEqual(["typescript", "python"])
  })

  it("rejects invalid config", async () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-cfg-"))
    dirs.push(home)
    const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
    ensurePaths(paths)
    const { writeFileSync } = await import("node:fs")
    writeFileSync(paths.configFile, "{ not json")
    expect(() => loadUserConfig(paths)).toThrow()
  })
})

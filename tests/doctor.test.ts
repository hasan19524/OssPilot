import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { ensurePaths, getPaths } from "../src/config/paths"
import { runDoctorChecks } from "../src/core/doctor"

describe("doctor checks", () => {
  it("passes core checks in an isolated home", async () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-doctor-"))
    try {
      const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
      ensurePaths(paths)
      const checks = await runDoctorChecks({
        paths,
        env: {} as NodeJS.ProcessEnv,
        skipCommands: true,
      })
      const failures = checks.filter((c) => c.status === "fail")
      expect(failures).toHaveLength(0)
      expect(checks.map((c) => c.name)).toContain("runtime")
      expect(checks.map((c) => c.name)).toContain("database")
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it("reports missing github token as a warning, not a failure", async () => {
    const home = mkdtempSync(join(tmpdir(), "osspilot-doctor-"))
    try {
      const paths = getPaths({ OSSPILOT_HOME: home } as NodeJS.ProcessEnv)
      ensurePaths(paths)
      const checks = await runDoctorChecks({
        paths,
        env: {} as NodeJS.ProcessEnv,
        skipCommands: true,
      })
      const gh = checks.find((c) => c.name === "github-token")
      // Token may be present in keyring from a previous setup; accept either.
      expect(["ok", "warn"]).toContain(gh?.status)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})

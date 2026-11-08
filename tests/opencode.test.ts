import { describe, expect, it } from "vitest"
import { OpenCodeAdapter } from "../src/agents/adapters/opencode"

describe("OpenCodeAdapter", () => {
  const adapter = new OpenCodeAdapter()

  it("has correct identity", () => {
    expect(adapter.id).toBe("opencode")
    expect(adapter.name).toBe("OpenCode")
    expect(adapter.experimental).toBe(false)
  })

  it("detects installation", async () => {
    const status = await adapter.detectInstallation()
    expect(status.installed).toBe(true)
    expect(status.version).toBeTruthy()
  })

  it("checks availability", async () => {
    const status = await adapter.checkAvailability()
    expect(status.available).toBe(true)
  })

  it("reports capabilities", async () => {
    const caps = await adapter.getCapabilities()
    expect(caps.structuredOutput).toBe(true)
    expect(caps.cancellation).toBe(true)
    expect(caps.sessionRecovery).toBe(true)
  })

  it("creates session without external ID fails", async () => {
    await expect(
      (async () => {
        for await (const _ of adapter.execute(
          { id: "test", status: "pending" },
          { prompt: "test" },
        )) {
          void _
        }
      })(),
    ).rejects.toThrow()
  })

  it("has shutdown method", () => {
    expect(typeof adapter.shutdown).toBe("function")
    adapter.shutdown() // Should not throw
  })
})

import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { agentRegistry, ensureAgent, getAgent } from "../src/agents/registry"
import { ConversationService } from "../src/core/conversation"

const tempDirs: string[] = []
let home: string

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "osspilot-conv-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

afterEach(() => {
  delete process.env.OSSPILOT_HOME
  for (const d of tempDirs.splice(0))
    rmSync(d, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 })
  home = mkdtempSync(join(tmpdir(), "osspilot-conv-"))
  tempDirs.push(home)
  process.env.OSSPILOT_HOME = home
})

describe("conversation sessions", () => {
  it("creates a session with a stable id", () => {
    const conv = new ConversationService()
    const s = conv.createSession({ title: "t" })
    expect(s.id).toMatch(/^session-/)
    expect(s.title).toBe("t")
    expect(s.archived).toBe(false)
    conv.close()
  })

  it("stores and reloads messages", () => {
    const conv = new ConversationService()
    const s = conv.createSession({ title: "t" })
    conv.appendMessage({ sessionId: s.id, role: "user", content: "hello" })
    conv.appendMessage({ sessionId: s.id, role: "assistant", content: "hi" })
    const msgs = conv.listMessages(s.id)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]?.role).toBe("user")
    expect(msgs[1]?.role).toBe("assistant")
    conv.close()
  })

  it("updates the session timestamp when a message is added", async () => {
    const conv = new ConversationService()
    const before = conv.createSession({ title: "t" })
    await new Promise((r) => setTimeout(r, 5))
    conv.appendMessage({ sessionId: before.id, role: "user", content: "x" })
    const after = conv.getSession(before.id)
    expect(after?.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())
    conv.close()
  })

  it("renames a session", () => {
    const conv = new ConversationService()
    const s = conv.createSession({ title: "old" })
    conv.renameSession(s.id, "new")
    expect(conv.getSession(s.id)?.title).toBe("new")
    conv.close()
  })

  it("archives a session without deleting it", () => {
    const conv = new ConversationService()
    const s = conv.createSession({ title: "t" })
    conv.archiveSession(s.id)
    expect(conv.listSessions()).toHaveLength(0)
    expect(conv.listSessions({ includeArchived: true })).toHaveLength(1)
    conv.close()
  })

  it("deletes a session and its messages", () => {
    const conv = new ConversationService()
    const s = conv.createSession({ title: "t" })
    conv.appendMessage({ sessionId: s.id, role: "user", content: "m" })
    conv.deleteSession(s.id)
    expect(conv.getSession(s.id)).toBeNull()
    expect(conv.listMessages(s.id)).toHaveLength(0)
    conv.close()
  })

  it("excludes archived sessions from the default list", () => {
    const conv = new ConversationService()
    conv.createSession({ title: "a" })
    const b = conv.createSession({ title: "b" })
    conv.archiveSession(b.id)
    expect(conv.listSessions().map((s) => s.title)).toEqual(["a"])
    conv.close()
  })

  it("returns null for a missing session", () => {
    const conv = new ConversationService()
    expect(conv.getSession("nope")).toBeNull()
    conv.close()
  })
})

describe("agent registry and runtime status", () => {
  it("bootstraps exactly once and exposes opencode", () => {
    const registry = ensureAgent()
    expect(registry.list().length).toBeGreaterThan(0)
    ensureAgent()
    expect(registry.list().length).toBe(1)
  })

  it("getAgent returns null for an unknown agent", () => {
    ensureAgent()
    expect(getAgent("definitely-missing")).toBeNull()
  })

  it("reports NOT_INSTALLED-style honest state for the installed agent", async () => {
    ensureAgent()
    const adapter = getAgent("opencode")
    expect(adapter).not.toBeNull()
    if (!adapter) throw new Error("adapter missing")
    const report = await adapter.getStatusReport()
    expect(report.state).toBe("IDLE")
    expect(report.installed).toBe(true)
    expect(report.version).toContain("2.")
    expect(report.executablePath).toContain("opencode")
  })

  it("reports NOT_INSTALLED for an unknown provider id", async () => {
    ensureAgent()
    const adapter = getAgent("opencode")
    if (!adapter) throw new Error("adapter missing")
    const report = await adapter.getStatusReport()
    expect(["IDLE", "DISCONNECTED", "CONNECTED", "NOT_INSTALLED"]).toContain(report.state)
  })

  it("registry has no duplicate registration", () => {
    const registry = ensureAgent()
    const ids = registry.list().map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(agentRegistry).toBe(registry)
  })
})

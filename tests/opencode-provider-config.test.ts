import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  detectProviderState,
  parseAuthProviders,
  parsePinnedModel,
} from "../src/agents/adapters/opencode/provider-config"

const tempDirs: string[] = []
afterEach(() => {
  for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "osspilot-oc-home-"))
  tempDirs.push(dir)
  return dir
}

describe("OpenCode auth parsing", () => {
  it("returns provider names only — never credential material", () => {
    const raw = JSON.stringify({
      openai: { type: "api", key: "sk-super-secret-value" },
      anthropic: { type: "api", key: "sk-ant-secret" },
    })
    const providers = parseAuthProviders(raw)
    expect(providers.sort()).toEqual(["anthropic", "openai"])
    expect(providers.join(",")).not.toContain("sk-")
    expect(providers.join(",")).not.toContain("secret")
  })

  it("reports nothing for malformed documents", () => {
    expect(parseAuthProviders("not json")).toEqual([])
    expect(parseAuthProviders("[]")).toEqual([])
    expect(parseAuthProviders("null")).toEqual([])
    expect(parseAuthProviders("{}")).toEqual([])
  })
})

describe("OpenCode pinned model parsing", () => {
  it("reads a configured model", () => {
    expect(parsePinnedModel('{"model":"openai/gpt-4o"}')).toBe("openai/gpt-4o")
  })

  it("reads .jsonc with comments", () => {
    expect(parsePinnedModel('// header\n{\n  "model": "anthropic/claude-sonnet-4"\n}')).toBe(
      "anthropic/claude-sonnet-4",
    )
  })

  it("returns null when no model is pinned or the file is invalid", () => {
    expect(parsePinnedModel('{"theme":"dark"}')).toBeNull()
    expect(parsePinnedModel("{oops")).toBeNull()
    expect(parsePinnedModel('{"model":42}')).toBeNull()
  })
})

describe("detectProviderState", () => {
  it("reports unauthenticated when no configuration exists", () => {
    const home = tempHome()
    const state = detectProviderState({ homedir: home, xdgDataHome: "", localAppData: "" })
    expect(state.authenticated).toBe(false)
    expect(state.providers).toEqual([])
    expect(state.model).toBeNull()
  })

  it("reads providers from the real OpenCode layout", () => {
    const home = tempHome()
    mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true })
    mkdirSync(join(home, ".config", "opencode"), { recursive: true })
    writeFileSync(
      join(home, ".local", "share", "opencode", "auth.json"),
      JSON.stringify({ openrouter: { key: "sk-or-SECRET" }, openai: { key: "sk-SECRET2" } }),
    )
    writeFileSync(
      join(home, ".config", "opencode", "opencode.json"),
      JSON.stringify({ model: "openrouter/openai/gpt-4o" }),
    )

    const state = detectProviderState({ homedir: home, xdgDataHome: "", localAppData: "" })
    expect(state.authenticated).toBe(true)
    expect(state.providers.sort()).toEqual(["openai", "openrouter"])
    expect(state.model).toBe("openrouter/openai/gpt-4o")
    // The API keys must never surface through this API.
    expect(JSON.stringify(state)).not.toContain("SECRET")
  })

  it("treats an unreadable auth file as not authenticated", () => {
    const home = tempHome()
    mkdirSync(join(home, ".local", "share", "opencode"), { recursive: true })
    writeFileSync(join(home, ".local", "share", "opencode", "auth.json"), "{ not json")
    const state = detectProviderState({ homedir: home, xdgDataHome: "", localAppData: "" })
    expect(state.authenticated).toBe(false)
    expect(state.providers).toEqual([])
  })
})

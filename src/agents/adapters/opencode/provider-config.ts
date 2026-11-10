/**
 * OpenCode provider configuration detection.
 *
 * Read-only: this module never prints or returns credential material. It only
 * reports *which* providers have stored credentials and whether a model is
 * pinned in the OpenCode config, so the TUI can say NOT_AUTHENTICATED instead
 * of pretending the agent is IDLE.
 *
 * The path inputs are injectable so the parsing is unit-testable without
 * touching the developer's real configuration.
 */

import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface ProviderState {
  /** Provider names that have stored credentials (never the credentials). */
  providers: string[]
  /** Model pinned in opencode.json, when one is configured. */
  model: string | null
  authenticated: boolean
}

export interface ProviderStatePaths {
  homedir?: string
  xdgDataHome?: string
  localAppData?: string
}

/** Parse an OpenCode `auth.json` document into provider names. */
export function parseAuthProviders(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return []
  return Object.keys(parsed).filter((key) => key.length > 0)
}

/** Read a pinned `model` out of an opencode.json / opencode.jsonc document. */
export function parsePinnedModel(raw: string): string | null {
  // `.jsonc` allows // comments; strip whole-line comments before parsing.
  const cleaned = raw.replace(/^[ \t]*\/\/.*$/gm, "")
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object") return null
  const value = (parsed as { model?: unknown }).model
  return typeof value === "string" && value.length > 0 ? value : null
}

function firstExisting(candidates: Array<string | null>): string | null {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

/** Locate and read the OpenCode provider configuration on this machine. */
export function detectProviderState(options: ProviderStatePaths = {}): ProviderState {
  const home = options.homedir ?? homedir()
  const xdg = options.xdgDataHome ?? process.env.XDG_DATA_HOME
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA

  const authFile = firstExisting([
    join(home, ".local", "share", "opencode", "auth.json"),
    xdg ? join(xdg, "opencode", "auth.json") : null,
    localAppData ? join(localAppData, "opencode", "auth.json") : null,
  ])

  const providers: string[] = []
  if (authFile) {
    try {
      providers.push(...parseAuthProviders(readFileSync(authFile, "utf8")))
    } catch {
      // Unreadable file: report "unknown", i.e. not authenticated.
    }
  }

  const configFile = firstExisting([
    join(home, ".config", "opencode", "opencode.json"),
    join(home, ".config", "opencode", "opencode.jsonc"),
    localAppData ? join(localAppData, "opencode", "opencode.json") : null,
  ])

  let model: string | null = null
  if (configFile) {
    try {
      model = parsePinnedModel(readFileSync(configFile, "utf8"))
    } catch {
      model = null
    }
  }

  const unique = Array.from(new Set(providers))
  return { providers: unique, model, authenticated: unique.length > 0 }
}

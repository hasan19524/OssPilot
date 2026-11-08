/**
 * Credential storage.
 *
 * - Primary: OS keyring via keytar (Windows Credential Manager).
 * - Fallback: environment variables (OSSPILOT_GITHUB_TOKEN, OSSPILOT_BHARATCODE_API_KEY).
 * - Last resort: encrypted file in ~/.osspilot (AES-256-GCM) — for headless/CI.
 *
 * Secrets are never logged or written to config files.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as keytar from "keytar"
import { getPaths } from "../config/paths"
import { decryptSecret, encryptSecret } from "./crypto"

const SERVICE = "osspilot"

export type CredentialKey = "github_token" | "bharatcode_api_key"

export interface CredentialStore {
  get(key: CredentialKey): Promise<string | null>
  set(key: CredentialKey, value: string): Promise<void>
  delete(key: CredentialKey): Promise<void>
}

class KeytarStore implements CredentialStore {
  async get(key: CredentialKey): Promise<string | null> {
    try {
      return await keytar.getPassword(SERVICE, key)
    } catch {
      return null
    }
  }
  async set(key: CredentialKey, value: string): Promise<void> {
    await keytar.setPassword(SERVICE, key, value)
  }
  async delete(key: CredentialKey): Promise<void> {
    await keytar.deletePassword(SERVICE, key)
  }
}

class EnvStore implements CredentialStore {
  private envVar(key: CredentialKey): string {
    return key === "github_token" ? "OSSPILOT_GITHUB_TOKEN" : "OSSPILOT_BHARATCODE_API_KEY"
  }
  async get(key: CredentialKey): Promise<string | null> {
    const v = process.env[this.envVar(key)]
    return v && v.trim().length > 0 ? v.trim() : null
  }
  async set(_key: CredentialKey, _value: string): Promise<void> {
    throw new Error("Cannot persist to environment; set the env var in your shell profile.")
  }
  async delete(_key: CredentialKey): Promise<void> {
    throw new Error("Cannot delete from environment.")
  }
}

class EncryptedFileStore implements CredentialStore {
  private file(): string {
    const paths = getPaths()
    mkdirSync(paths.configDir, { recursive: true })
    return join(paths.configDir, "credentials.enc")
  }
  private readAll(): Record<string, string> {
    const f = this.file()
    if (!existsSync(f)) return {}
    try {
      const raw = readFileSync(f, "utf8")
      const decrypted = decryptSecret(raw)
      return JSON.parse(decrypted) as Record<string, string>
    } catch {
      return {}
    }
  }
  private writeAll(data: Record<string, string>): void {
    const encrypted = encryptSecret(JSON.stringify(data))
    writeFileSync(this.file(), encrypted, "utf8")
  }
  async get(key: CredentialKey): Promise<string | null> {
    const data = this.readAll()
    return data[key] ?? null
  }
  async set(key: CredentialKey, value: string): Promise<void> {
    const data = this.readAll()
    data[key] = value
    this.writeAll(data)
  }
  async delete(key: CredentialKey): Promise<void> {
    const data = this.readAll()
    delete data[key]
    this.writeAll(data)
  }
}

export function createCredentialStore(): CredentialStore {
  // Try keytar first; if it fails (e.g., headless), fall back to encrypted file.
  // We detect by attempting a no-op get.
  return new CompositeStore()
}

class CompositeStore implements CredentialStore {
  private keytar = new KeytarStore()
  private file = new EncryptedFileStore()
  private env = new EnvStore()

  async get(key: CredentialKey): Promise<string | null> {
    try {
      const v = await this.keytar.get(key)
      if (v) return v
    } catch {
      // fall through
    }
    const fv = await this.file.get(key)
    if (fv) return fv
    return this.env.get(key)
  }
  async set(key: CredentialKey, value: string): Promise<void> {
    try {
      await this.keytar.set(key, value)
      return
    } catch {
      await this.file.set(key, value)
    }
  }
  async delete(key: CredentialKey): Promise<void> {
    try {
      await this.keytar.delete(key)
    } catch {
      /* ignore */
    }
    await this.file.delete(key)
  }
}

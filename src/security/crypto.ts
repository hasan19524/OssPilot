/**
 * AES-256-GCM encryption helpers for credential files.
 *
 * Security model:
 * - Primary: OS keyring (keytar) stores a cryptographically random 256-bit key.
 * - Fallback: OSSPILOT_CREDENTIAL_KEY environment variable.
 * - Legacy: old hardcoded dev key is tried ONCE for migration, then credentials
 *   are re-encrypted with the new key. The old key is never used for new data.
 * - If no key source is available, encryption operations throw (fail hard).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16
const KEYRING_SERVICE = "osspilot"
const KEYRING_ACCOUNT = "encryption_key"

// Legacy key used in v0.x (for one-time migration only)
const LEGACY_KEY = Buffer.alloc(KEY_LENGTH, "osspilot-dev-key-".repeat(2).slice(0, KEY_LENGTH))

/**
 * Synchronous key resolution for backward compat with encryptSecret/decryptSecret sync API.
 * Tries env var first, then falls back to legacy key ONLY for decryption attempts.
 * For new encryption, requires env var or throws.
 */
async function resolveKey(allowLegacy: boolean): Promise<Buffer> {
  // 1. Environment variable
  const envKey = process.env.OSSPILOT_CREDENTIAL_KEY
  if (envKey && envKey.length >= KEY_LENGTH) {
    return Buffer.from(envKey.slice(0, KEY_LENGTH), "utf8")
  }

  // 2. OS keyring (keytar)
  try {
    const keytar = await import("keytar")
    let storedKey = await keytar.getPassword(KEYRING_SERVICE, KEYRING_ACCOUNT)
    if (!storedKey) {
      // Generate new random key and store it
      storedKey = randomBytes(KEY_LENGTH).toString("base64")
      await keytar.setPassword(KEYRING_SERVICE, KEYRING_ACCOUNT, storedKey)
    }
    return Buffer.from(storedKey, "base64")
  } catch {
    // keytar not available (headless/CI)
  }

  // 3. Legacy key (migration only)
  if (allowLegacy) {
    return LEGACY_KEY
  }

  // 4. Fail hard
  throw new Error(
    "No encryption key available. Set OSSPILOT_CREDENTIAL_KEY or ensure OS keyring is accessible.",
  )
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await resolveKey(false)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

/**
 * Decrypt with migration support:
 * 1. Try current key (env var)
 * 2. Try keyring-stored key
 * 3. Try legacy hardcoded key (one-time migration)
 *
 * If legacy key works, the caller should re-encrypt with the new key.
 */
export async function decryptSecret(ciphertext: string): Promise<string> {
  // Try env var key first
  const envKey = process.env.OSSPILOT_CREDENTIAL_KEY
  if (envKey && envKey.length >= KEY_LENGTH) {
    try {
      return decryptWithKey(ciphertext, Buffer.from(envKey.slice(0, KEY_LENGTH), "utf8"))
    } catch {
      // Fall through to try other keys
    }
  }

  // Try keyring key
  try {
    const keytar = await import("keytar")
    const storedKey = await keytar.getPassword(KEYRING_SERVICE, KEYRING_ACCOUNT)
    if (storedKey) {
      return decryptWithKey(ciphertext, Buffer.from(storedKey, "base64"))
    }
  } catch {
    // keytar not available
  }

  // Try legacy key (migration path)
  try {
    return decryptWithKey(ciphertext, LEGACY_KEY)
  } catch {
    // Legacy key didn't work either
  }

  throw new Error(
    "Decryption failed: no valid key found. " +
      "If you have existing encrypted credentials, set OSSPILOT_CREDENTIAL_KEY " +
      "or re-enter your credentials with 'osspilot config auth'.",
  )
}

function decryptWithKey(ciphertext: string, key: Buffer): string {
  const data = Buffer.from(ciphertext, "base64")
  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid ciphertext: too short")
  }
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString("utf8")
}

/**
 * Check if a ciphertext was encrypted with the legacy key.
 * Used for migration detection.
 */
export function isLegacyEncrypted(ciphertext: string): boolean {
  try {
    decryptWithKey(ciphertext, LEGACY_KEY)
    // Also verify it's NOT decryptable with current key
    const envKey = process.env.OSSPILOT_CREDENTIAL_KEY
    if (envKey && envKey.length >= KEY_LENGTH) {
      try {
        decryptWithKey(ciphertext, Buffer.from(envKey.slice(0, KEY_LENGTH), "utf8"))
        return false // decryptable with current key, not legacy
      } catch {
        return true // only legacy key works
      }
    }
    return true // no env key, legacy key works → it's legacy
  } catch {
    return false
  }
}

/**
 * Migrate a legacy-encrypted credential to the new key.
 * Returns the re-encrypted ciphertext, or null if migration is not possible.
 */
export async function migrateCredential(ciphertext: string): Promise<string | null> {
  try {
    const plaintext = decryptWithKey(ciphertext, LEGACY_KEY)
    // Re-encrypt with current key (will throw if no key available)
    return await encryptSecret(plaintext)
  } catch {
    return null
  }
}

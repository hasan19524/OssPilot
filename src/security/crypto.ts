/**
 * AES-256-GCM encryption helpers for credential files.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const KEY_LENGTH = 32
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getKey(): Buffer {
  const envKey = process.env.OSSPILOT_CREDENTIAL_KEY
  if (envKey && envKey.length >= KEY_LENGTH) {
    return Buffer.from(envKey.slice(0, KEY_LENGTH), "utf8")
  }
  // Dev fallback: derive from a fixed salt + machine (NOT for production).
  return Buffer.alloc(KEY_LENGTH, "osspilot-dev-key-".repeat(2).slice(0, KEY_LENGTH))
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString("base64")
}

export function decryptSecret(ciphertext: string): string {
  const key = getKey()
  const data = Buffer.from(ciphertext, "base64")
  const iv = data.subarray(0, IV_LENGTH)
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString("utf8")
}

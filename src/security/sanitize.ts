/**
 * Untrusted-content sanitisation.
 *
 * Single implementation shared by the CLI contribution command, the
 * contribution runner and the TUI dispatcher.
 */

import { createHash } from "node:crypto"

const MAX_LEN = 10000

const INJECTION_PATTERNS: Array<[RegExp, string]> = [
  [/ignore (all |previous |above )?instructions/gi, "[REDACTED INSTRUCTION]"],
  [/you are now/gi, "[REDACTED]"],
  [/system prompt/gi, "[REDACTED]"],
  [/disregard (all |previous |above )?instructions/gi, "[REDACTED INSTRUCTION]"],
]

/**
 * Truncate over-long content and redact obvious instruction-injection
 * phrases. Delimiters plus this redaction are defence-in-depth; the real
 * boundary is that repository content is never executed.
 */
export function sanitizeUntrusted(text: string): string {
  let out = text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}\n... (truncated)` : text
  for (const [pattern, replacement] of INJECTION_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/** Stable content hash for cache keys / dedupe without leaking the content. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32)
}

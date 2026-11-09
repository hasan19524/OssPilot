/**
 * Extract a file path from an OpenCode tool state.
 *
 * Tool states are not uniform across tools, so extraction tries, in order:
 *   1. structured input fields (path, file_path, ...)
 *   2. explicit "wrote/modified/..." phrasing
 *   3. "Read file <path>" phrasing
 *   4. any filename-looking token in the content text
 *
 * Returns the basename so the TUI can show a short, stable name.
 */

const FILE_EXTENSIONS = "js|ts|tsx|jsx|py|rs|go|rb|java|md|json|html|css|toml|ya?ml"

function basename(path: string): string {
  const normalised = path.replace(/\\/g, "/")
  const parts = normalised.split("/")
  return parts[parts.length - 1] ?? path
}

function isFilePath(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function extractAffectedPath(state: Record<string, unknown> | undefined): string | null {
  if (!state) return null

  // 1. Structured tool input.
  const input = state.input
  if (input && typeof input === "object") {
    for (const key of ["path", "file_path", "filePath", "filename", "file"]) {
      const value = (input as Record<string, unknown>)[key]
      if (isFilePath(value)) return basename(value.trim())
    }
  }

  const content = state.content
  if (!Array.isArray(content)) return null

  for (const item of content) {
    if (!item || typeof item !== "object") continue
    if ((item as { type?: string }).type !== "text") continue
    const text = String((item as { text?: string }).text ?? "")

    // 2. Explicit modification phrasing.
    const wrote =
      text.match(
        /(?:wrote|modified|edited|updated|created|patched|write file)\s*(?:file)?\s*[:=-]?\s*["']?([A-Za-z]:[\\/][^\s"',;]+)/i,
      ) ??
      text.match(
        /(?:wrote|modified|edited|updated|created|patched|write file)\s*(?:file)?\s*[:=-]?\s*["']?(\/[^\s"',;]+)/i,
      )
    if (wrote?.[1]) return basename(wrote[1])

    // 3. Read phrasing.
    const read =
      text.match(/Read file\s+([A-Za-z]:[\\/][^\s,;]+)/) ?? text.match(/Read file\s+(\/[^\s,;]+)/)
    if (read?.[1]) return basename(read[1])

    // 4. Any filename token, preferring the longest match (the full path).
    const tokens = text.match(new RegExp(`[A-Za-z0-9_.\\-/]+\\.(?:${FILE_EXTENSIONS})\\b`, "gi"))
    if (tokens && tokens.length > 0) {
      const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a))
      return basename(longest)
    }
  }

  return null
}

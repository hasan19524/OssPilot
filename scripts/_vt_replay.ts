/**
 * Replay raw terminal (VT/ANSI) output into a text screen buffer.
 *
 * Used by the headless TUI acceptance harness: the real application runs with
 * redirected stdin/stdout, and this replays what it drew so scenarios can be
 * asserted against the actual on-screen text.
 *
 * Usage: bun run scripts/_vt_replay.ts <raw-output-file> [--cols N] [--rows N]
 */
import { readFileSync } from "node:fs"

const args = process.argv.slice(2)
const file = args[0]
if (!file) {
  console.error("usage: bun run scripts/_vt_replay.ts <raw-file> [--cols N] [--rows N]")
  process.exit(2)
}
const opt = (name: string, fallback: number): number => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback
}
const cols = opt("--cols", 80)
const rows = opt("--rows", 25)

const raw = readFileSync(file, "utf8")
const screen: string[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "))
let row = 0
let col = 0
const put = (ch: string): void => {
  if (row >= 0 && row < rows && col >= 0 && col < cols) screen[row][col] = ch
  col++
}

const params = (s: string): number[] =>
  s.split(";").map((p) => (p === "" ? 1 : Number(p) || 0))

let i = 0
while (i < raw.length) {
  const ch = raw[i]
  if (ch !== "\x1b") {
    if (ch === "\r") col = 0
    else if (ch === "\n") row++
    else if (ch === "\b") col = Math.max(0, col - 1)
    else if (ch === "\t") col = Math.min(cols - 1, col + 8)
    else if (ch >= " " || ch === "\x00") put(ch)
    i++
    continue
  }
  // Escape sequences
  const next = raw[i + 1]
  if (next === "[") {
    let j = i + 2
    let seq = ""
    while (j < raw.length && !/[a-zA-Z]/.test(raw[j] ?? "")) {
      seq += raw[j]
      j++
    }
    const final = raw[j] ?? ""
    const p = params(seq.replace(/\?/, ""))
    if (final === "H" || final === "f") {
      row = Math.max(0, (p[0] ?? 1) - 1)
      col = Math.max(0, (p[1] ?? 1) - 1)
    } else if (final === "A") row = Math.max(0, row - (p[0] ?? 1))
    else if (final === "B") row = Math.min(rows - 1, row + (p[0] ?? 1))
    else if (final === "C") col = Math.min(cols - 1, col + (p[0] ?? 1))
    else if (final === "D") col = Math.max(0, col - (p[0] ?? 1))
    else if (final === "G") col = Math.max(0, (p[0] ?? 1) - 1)
    else if (final === "d") row = Math.max(0, (p[0] ?? 1) - 1)
    else if (final === "K") {
      const mode = p[0] ?? 0
      if (mode === 0) for (let c = col; c < cols; c++) screen[row][c] = " "
      else if (mode === 1) for (let c = 0; c <= col; c++) screen[row][c] = " "
      else for (let c = 0; c < cols; c++) screen[row][c] = " "
    } else if (final === "J") {
      const mode = p[0] ?? 0
      if (mode === 2) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) screen[r][c] = " "
    }
    // SGR (m) and modes (h/l, etc.) intentionally ignored: text is what matters.
    i = j + 1
    continue
  }
  if (next === "]") {
    // OSC ... BEL | ST
    let j = i + 2
    while (j < raw.length && raw[j] !== "\x07" && !(raw[j] === "\x1b" && raw[j + 1] === "\\")) j++
    i = raw[j] === "\x07" ? j + 1 : j + 2
    continue
  }
  if (next === "P" || next === "X" || next === "^" || next === "_") {
    let j = i + 2
    while (j < raw.length && !(raw[j] === "\x1b" && raw[j + 1] === "\\")) j++
    i = j + 2
    continue
  }
  if (next === "s" || next === "u" || next === "7" || next === "8" || next === "=" || next === ">") {
    i += 2
    continue
  }
  if (next && "\x1b()#%*+".includes(next)) {
    i += 3
    continue
  }
  i += 2
}

const lines = screen.map((r) => r.join("").replace(/\s+$/, ""))
while (lines.length > 0 && (lines[lines.length - 1] ?? "").length === 0) lines.pop()
console.log(lines.map((l, idx) => `${String(idx + 1).padStart(2, " ")}| ${l}`).join("\n"))

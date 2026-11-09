/**
 * Cross-runtime command resolution.
 *
 * Node's `execFile` on Windows cannot spawn `.cmd` wrappers directly
 * (EINVAL), while Bun can. npm-installed global tools (opencode, gh) ship a
 * `.cmd`/extension-less shim in the npm prefix plus the real `.exe` under
 * `node_modules`. This module resolves the real executable so both runtimes
 * behave identically.
 */

import { execFile } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

const cache = new Map<string, string>()

export async function resolveCommand(command: string): Promise<string> {
  const cached = cache.get(command)
  if (cached) return cached

  if (process.platform !== "win32") {
    cache.set(command, command)
    return command
  }

  let resolved = command

  // 1. `where` results — prefer .exe, then search node_modules behind the shim.
  try {
    const { stdout } = await execFileAsync("where", [command], { timeout: 5000, windowsHide: true })
    const lines = stdout
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const exe = lines.find((l) => l.toLowerCase().endsWith(".exe"))
    if (exe) {
      resolved = exe
    } else {
      // No real .exe on PATH — search node_modules under the npm prefix.
      const firstLine = lines[0]
      const npmPrefix = firstLine ? dirname(firstLine) : null
      if (npmPrefix) {
        const found = findExeInNodeModules(join(npmPrefix, "node_modules"), command)
        if (found) resolved = found
      }
    }
  } catch {
    // `where` unavailable.
  }

  // Global npm root via APPDATA (independent of PATH).
  const globalRoot = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules") : null
  if (resolved === command && globalRoot) {
    const found = findExeInNodeModules(globalRoot, command)
    if (found) resolved = found
  }

  // npm-global opencode installs under @opencode/cli with an extension-less
  // shim whose binary differs from the command name, so check it explicitly.
  if (resolved === command && command === "opencode" && globalRoot) {
    const known = join(globalRoot, "@opencode", "cli", "bin", "opencode.exe")
    if (existsSync(known)) resolved = known
  }

  cache.set(command, resolved)
  return resolved
}

/** Search `<root>/<scope>/pkg/bin/<name>.exe` and simple `<root>/pkg/bin/<name>.exe`. */
function findExeInNodeModules(root: string, command: string): string | null {
  const candidates: string[] = []
  try {
    const entries = readdirSync(root, { withFileTypes: true })
    const scopes = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("@"))
      .map((e) => e.name)

    for (const scope of scopes) {
      try {
        const scopeDir = join(root, scope)
        const pkgs = readdirSync(scopeDir, { withFileTypes: true })
        for (const pkg of pkgs) {
          if (!pkg.isDirectory()) continue
          candidates.push(join(scopeDir, pkg.name, "bin", `${command}.exe`))
        }
      } catch {
        // ignore
      }
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue
      candidates.push(join(root, e.name, "bin", `${command}.exe`))
    }
  } catch {
    // ignore
  }

  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

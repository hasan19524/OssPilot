/**
 * GitHub authentication helpers.
 *
 * Token resolution order (first non-empty wins):
 *   1. Explicit token passed by caller
 *   2. The configured env var (default OSSPILOT_GITHUB_TOKEN)
 *   3. GH_TOKEN / GITHUB_TOKEN (convention)
 *   4. `gh auth token` (bootstrap from an existing gh login, with consent)
 *
 * Secrets are never logged. Device flow is implemented in a later phase;
 * for now, env/gh bootstrap covers local development.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveCommand } from "../../core/exec"

const execFileAsync = promisify(execFile)

export interface TokenResolution {
  token: string | null
  source: "explicit" | "env" | "gh-cli" | "none"
}

export async function resolveGitHubToken(
  explicit: string | undefined,
  envVarName: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TokenResolution> {
  if (explicit && explicit.trim().length > 0) {
    return { token: explicit.trim(), source: "explicit" }
  }
  const fromConfigured = env[envVarName]
  if (fromConfigured && fromConfigured.trim().length > 0) {
    return { token: fromConfigured.trim(), source: "env" }
  }
  for (const fallback of ["GH_TOKEN", "GITHUB_TOKEN"]) {
    const value = env[fallback]
    if (value && value.trim().length > 0) {
      return { token: value.trim(), source: "env" }
    }
  }
  // Bootstrap from gh CLI (only if installed and authenticated).
  try {
    const ghBin = await resolveCommand("gh")
    const { stdout } = await execFileAsync(ghBin, ["auth", "token"], {
      timeout: 8000,
      windowsHide: true,
    })
    const token = stdout.trim()
    if (token.length > 0) {
      return { token, source: "gh-cli" }
    }
  } catch {
    // gh not installed or not authenticated — fine.
  }
  return { token: null, source: "none" }
}

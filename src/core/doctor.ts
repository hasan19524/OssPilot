/**
 * Environment health checks (`osspilot doctor`).
 *
 * Pure, unit-testable check functions. Each check returns a structured result;
 * the CLI command only renders them.
 */

import { execFile } from "node:child_process"
import { accessSync, constants } from "node:fs"
import { promisify } from "node:util"
import { ensurePaths, getPaths, type OSSPilotPaths } from "../config/paths"
import { loadUserConfig } from "../config/settings"
import { openDatabase } from "../storage/database/client"
import { resolveCommand } from "./exec"

const execFileAsync = promisify(execFile)

export type CheckStatus = "ok" | "warn" | "fail"

export interface CheckResult {
  name: string
  status: CheckStatus
  detail: string
  hint?: string
}

function ok(name: string, detail: string): CheckResult {
  return { name, status: "ok", detail }
}
function warn(name: string, detail: string, hint?: string): CheckResult {
  return { name, status: "warn", detail, hint }
}
function fail(name: string, detail: string, hint?: string): CheckResult {
  return { name, status: "fail", detail, hint }
}

export interface DoctorOptions {
  paths?: OSSPilotPaths
  env?: NodeJS.ProcessEnv
  /** Skip checks that spawn subprocesses (unit tests). */
  skipCommands?: boolean
}

async function commandVersion(
  command: string,
  args: string[],
  timeoutMs = 8000,
): Promise<string | null> {
  try {
    const bin = await resolveCommand(command)
    const { stdout } = await execFileAsync(bin, args, { timeout: timeoutMs, windowsHide: true })
    return stdout.trim().split(/\r?\n/)[0] ?? null
  } catch {
    return null
  }
}

export async function runDoctorChecks(options: DoctorOptions = {}): Promise<CheckResult[]> {
  const env = options.env ?? process.env
  const paths = options.paths ?? getPaths()
  const results: CheckResult[] = []

  // 1. Runtime
  const bunVersion = process.versions.bun
  results.push(ok("runtime", bunVersion ? `bun ${bunVersion}` : `node ${process.version}`))

  // 2. Directory layout
  try {
    ensurePaths(paths)
    results.push(ok("home", paths.root))
  } catch (error) {
    results.push(fail("home", `cannot create ${paths.root}: ${String(error)}`))
    return results
  }

  // 3. Database + migrations
  try {
    const db = openDatabase({ file: paths.databaseFile })
    db.close()
    results.push(ok("database", paths.databaseFile))
  } catch (error) {
    results.push(fail("database", String(error), "Check disk permissions at ~/.osspilot"))
    return results
  }

  // 4. User config
  try {
    const config = loadUserConfig(paths)
    results.push(ok("config", `valid (${config.skills.length} skills declared)`))
  } catch (error) {
    results.push(fail("config", String(error)))
  }

  // 5. Git
  if (options.skipCommands) {
    results.push({ name: "git", status: "warn", detail: "skipped in test mode" })
  } else {
    const gitVersion = await commandVersion("git", ["--version"])
    if (gitVersion) {
      results.push(ok("git", gitVersion))
    } else {
      results.push(fail("git", "git not found on PATH", "Install git: https://git-scm.com"))
    }

    // 6. GitHub CLI (optional auth bootstrap source)
    const ghVersion = await commandVersion("gh", ["--version"])
    if (!ghVersion) {
      results.push(warn("gh", "gh CLI not found (optional)", "Optional; enables token bootstrap"))
    } else {
      results.push(ok("gh", ghVersion))
    }

    // 7. OpenCode
    const opencodeVersion = await commandVersion("opencode", ["--version"])
    if (opencodeVersion) {
      results.push(ok("opencode", opencodeVersion))
    } else {
      results.push(fail("opencode", "opencode not found on PATH", "Install: https://opencode.ai"))
    }
  }

  // 8. GitHub token source
  const config = loadUserConfig(paths)
  const { createCredentialStore } = await import("../security/credentials")
  const store = createCredentialStore()
  const storedGhToken = await store.get("github_token")
  const ghToken = storedGhToken ?? env[config.githubTokenEnvVar] ?? env.GH_TOKEN ?? env.GITHUB_TOKEN
  if (ghToken && ghToken.length > 0) {
    const source = storedGhToken
      ? "OS keyring"
      : env[config.githubTokenEnvVar]
        ? "env var"
        : "GH_TOKEN/GITHUB_TOKEN"
    results.push(ok("github-token", `configured (${source})`))
  } else {
    results.push(
      warn(
        "github-token",
        "not configured",
        'Run "osspilot config auth github" to authenticate, or set OSSPILOT_GITHUB_TOKEN',
      ),
    )
  }

  // 9. BharatCode API key
  const storedBcKey = await store.get("bharatcode_api_key")
  const bcKey = storedBcKey ?? env[config.bharatcodeApiKeyEnvVar]
  if (bcKey && bcKey.length > 0) {
    results.push(ok("bharatcode", `${config.bharatcodeModel} via ${config.bharatcodeBaseUrl}`))
  } else {
    results.push(
      warn(
        "bharatcode",
        "not configured (AI features disabled)",
        'Run "osspilot config auth bharatcode" or use OpenAI/Anthropic/Ollama instead',
      ),
    )
  }

  // 10. LLM providers
  const providers: string[] = []
  if (storedBcKey ?? env[config.bharatcodeApiKeyEnvVar]) providers.push("BharatCode")
  if (env.OSSPILOT_OPENAI_API_KEY) providers.push("OpenAI")
  if (env.OSSPILOT_ANTHROPIC_API_KEY) providers.push("Anthropic")
  try {
    const res = await fetch("http://localhost:11434/api/tags")
    if (res.ok) providers.push("Ollama (local)")
  } catch {
    /* not running */
  }
  if (providers.length > 0) {
    results.push(ok("llm-providers", providers.join(", ")))
  } else {
    results.push(
      warn("llm-providers", "none configured", "Set up at least one LLM provider for AI features"),
    )
  }

  return results
}

/** Readable file check used by workspace validation later. */
export function isReadable(path: string): boolean {
  try {
    accessSync(path, constants.R_OK)
    return true
  } catch {
    return false
  }
}

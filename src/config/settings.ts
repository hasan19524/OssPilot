/**
 * User configuration (config/config.json), validated with Zod.
 *
 * Secrets (GitHub token, BharatCode API key) are NOT stored here.
 * They are read from the environment or OS credential storage — see
 * security/credentials.ts. This file only holds non-secret preferences.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { z } from "zod"
import { OSSPilotError } from "../core/errors"
import type { OSSPilotPaths } from "./paths"

export const userConfigSchema = z.object({
  /** Optional explicit GitHub token source hint: environment variable name. */
  githubTokenEnvVar: z.string().min(1).default("OSSPILOT_GITHUB_TOKEN"),
  /** BharatCode API key environment variable name. */
  bharatcodeApiKeyEnvVar: z.string().min(1).default("OSSPILOT_BHARATCODE_API_KEY"),
  bharatcodeBaseUrl: z.string().url().default("https://bharatcode.ai/api/model/v1"),
  bharatcodeModel: z.string().min(1).default("qwen-3.8-27b"),
  /** Preferred coding agent id (registry key). Initial release: "opencode". */
  preferredAgent: z.string().min(1).default("opencode"),
  /** Where the TUI writes log lines: "file" (default) keeps the terminal clean. */
  logSink: z.enum(["file", "stdout", "stderr", "none"]).default("file"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  /** Declared skills used for issue/skill matching, e.g. ["typescript", "python"]. */
  skills: z.array(z.string().min(1)).default([]),
})

export type UserConfig = z.infer<typeof userConfigSchema>

export function defaultUserConfig(): UserConfig {
  return userConfigSchema.parse({})
}

export function loadUserConfig(paths: OSSPilotPaths): UserConfig {
  if (!existsSync(paths.configFile)) return defaultUserConfig()
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(paths.configFile, "utf8"))
  } catch (error) {
    throw new OSSPilotError(
      "CONFIG_INVALID",
      `Config file at ${paths.configFile} is not valid JSON: ${String(error)}`,
      `Fix or delete the file, or run "osspilot config reset".`,
    )
  }
  const parsed = userConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    throw new OSSPilotError(
      "CONFIG_INVALID",
      `Invalid config: ${issues}`,
      `Run "osspilot config reset" to restore defaults.`,
    )
  }
  return parsed.data
}

export function saveUserConfig(paths: OSSPilotPaths, config: UserConfig): void {
  mkdirSync(paths.configDir, { recursive: true })
  writeFileSync(paths.configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

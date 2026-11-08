/**
 * OSSPilot directory layout: ~/.osspilot/
 *
 *   config/       configuration files
 *   database/     SQLite database (state.osspilot.db)
 *   repositories/ cloned repositories (shared, reused across contributions)
 *   worktrees/    one isolated worktree per contribution
 *   sessions/     agent session metadata for recovery
 *   logs/         application logs
 *   cache/        HTTP/AI response caches
 */

import { chmodSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

export interface OSSPilotPaths {
  root: string
  configDir: string
  databaseDir: string
  repositoriesDir: string
  worktreesDir: string
  sessionsDir: string
  logsDir: string
  cacheDir: string
  databaseFile: string
  configFile: string
}

/** Resolve the OSSPilot home directory (overridable for tests). */
export function resolveOSSPilotRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OSSPILOT_HOME
  if (override && override.trim().length > 0) return override
  return join(homedir(), ".osspilot")
}

export function getPaths(env: NodeJS.ProcessEnv = process.env): OSSPilotPaths {
  const root = resolveOSSPilotRoot(env)
  return {
    root,
    configDir: join(root, "config"),
    databaseDir: join(root, "database"),
    repositoriesDir: join(root, "repositories"),
    worktreesDir: join(root, "worktrees"),
    sessionsDir: join(root, "sessions"),
    logsDir: join(root, "logs"),
    cacheDir: join(root, "cache"),
    databaseFile: join(root, "database", "state.osspilot.db"),
    configFile: join(root, "config", "config.json"),
  }
}

/** Create the directory layout if missing. Idempotent. */
export function ensurePaths(paths: OSSPilotPaths = getPaths()): OSSPilotPaths {
  const isUnix = process.platform !== "win32"
  const dirMode = isUnix ? 0o700 : undefined

  for (const dir of [
    paths.root,
    paths.configDir,
    paths.databaseDir,
    paths.repositoriesDir,
    paths.worktreesDir,
    paths.sessionsDir,
    paths.logsDir,
    paths.cacheDir,
  ]) {
    mkdirSync(dir, { recursive: true, mode: dirMode })
    // On Unix, chmod existing directories (mkdirSync mode only applies to new dirs)
    if (isUnix) {
      try {
        chmodSync(dir, 0o700)
      } catch {
        // Ignore chmod errors (e.g., on Windows or permission issues)
      }
    }
  }
  return paths
}

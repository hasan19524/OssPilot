/**
 * Security: credential resolution and command policy.
 *
 * - Credentials come from environment variables or OS credential storage.
 *   Never from config files, never logged.
 * - Command policy: an allow-list of commands the runner/verification may
 *   execute; destructive git operations require explicit approval.
 */

export interface CommandPolicy {
  /** Commands that may run without approval. */
  allowed: string[]
  /** Commands that require explicit user approval. */
  requiresApproval: string[]
  /** Commands that are always denied. */
  denied: string[]
}

export const DEFAULT_COMMAND_POLICY: CommandPolicy = {
  allowed: [
    "git status",
    "git diff",
    "git log",
    "git branch",
    "git show",
    "npm test",
    "bun test",
    "vitest",
    "npm run",
    "bun run",
  ],
  requiresApproval: [
    "git commit",
    "git push",
    "git reset",
    "git clean",
    "git checkout",
    "rm",
    "del",
    "rmdir",
    "mv",
    "cp",
    "npm install",
    "bun install",
    "pip install",
  ],
  denied: [
    "rm -rf /",
    "rm -rf ~",
    "rm -rf /*",
    "rm -rf *",
    "format",
    "mkfs",
    "dd if=",
    "shutdown",
    "reboot",
    ":(){:|:&};:",
    "chmod -R 777",
    "chmod 777",
  ],
}

export function classifyCommand(
  command: string,
  policy: CommandPolicy = DEFAULT_COMMAND_POLICY,
): "allowed" | "approval" | "denied" {
  const normalized = command.trim().toLowerCase()
  for (const denied of policy.denied) {
    if (normalized.includes(denied.toLowerCase())) return "denied"
  }
  for (const approval of policy.requiresApproval) {
    if (normalized.startsWith(approval.toLowerCase())) return "approval"
  }
  for (const allowed of policy.allowed) {
    if (normalized.startsWith(allowed.toLowerCase())) return "allowed"
  }
  // Unknown commands default to requiring approval (safe default).
  return "approval"
}

export function resolveCredential(
  envVar: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const value = env[envVar]
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

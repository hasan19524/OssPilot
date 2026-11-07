/**
 * OSSPilot application errors.
 *
 * Every error carries a machine-readable code so the CLI/TUI can render
 * helpful messages and the event journal can persist failures reliably.
 */

export type OSSPilotErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "DATABASE_ERROR"
  | "MIGRATION_ERROR"
  | "GITHUB_AUTH_REQUIRED"
  | "GITHUB_API_ERROR"
  | "INTELLIGENCE_UNAVAILABLE"
  | "AGENT_NOT_DETECTED"
  | "AGENT_SESSION_ERROR"
  | "WORKSPACE_ERROR"
  | "POLICY_VIOLATION"
  | "UNEXPECTED"

export class OSSPilotError extends Error {
  readonly code: OSSPilotErrorCode
  readonly hint?: string

  constructor(code: OSSPilotErrorCode, message: string, hint?: string) {
    super(message)
    this.name = "OSSPilotError"
    this.code = code
    this.hint = hint
  }
}

export function isOSSPilotError(error: unknown): error is OSSPilotError {
  return error instanceof OSSPilotError
}

/** Format any thrown value into a safe, user-presentable string (never logs secrets). */
export function formatError(error: unknown): string {
  if (isOSSPilotError(error)) {
    const hint = error.hint ? `\nHint: ${error.hint}` : ""
    return `[${error.code}] ${error.message}${hint}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

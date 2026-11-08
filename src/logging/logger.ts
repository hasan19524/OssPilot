/**
 * Structured logger.
 *
 * - Human-readable single-line output for the CLI.
 * - JSON lines when OSSPILOT_LOG_FORMAT=json (machine-readable).
 * - File sink at ~/.osspilot/logs/osspilot.log (never logs credentials).
 */

import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { getPaths } from "../config/paths"

export type LogLevel = "debug" | "info" | "warn" | "error"

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
}

interface LoggerOptions {
  /** Minimum level to emit (default: env OSSPILOT_LOG_LEVEL or "info"). */
  level?: LogLevel
  /** Where logs go: "stderr" (default), "stdout", "file", "none". */
  sink?: "stderr" | "stdout" | "file" | "none"
}

let activeLogger: Logger | null = null

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? readEnvLogLevel()
  const sink = options.sink ?? readEnvSink()
  const json = process.env.OSSPILOT_LOG_FORMAT === "json"

  const emit = (lvl: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level] || sink === "none") return
    const time = new Date().toISOString()
    const sanitizedMessage = sanitizeValue(message)
    const sanitizedData = data ? sanitizeData(data) : undefined
    const line = json
      ? JSON.stringify({ time, level: lvl, message: sanitizedMessage, ...sanitizedData })
      : `${time} ${lvl.toUpperCase().padEnd(5)} ${sanitizedMessage}${formatData(sanitizedData)}`
    writeLine(sink, line)
  }

  return {
    debug: (m, d) => emit("debug", m, d),
    info: (m, d) => emit("info", m, d),
    warn: (m, d) => emit("warn", m, d),
    error: (m, d) => emit("error", m, d),
  }
}

/** Process-wide logger used by services that should not construct their own. */
export function getLogger(): Logger {
  if (!activeLogger) activeLogger = createLogger()
  return activeLogger
}

export function setLogger(logger: Logger): void {
  activeLogger = logger
}

function sanitizeValue(value: string): string {
  return value
    .replace(/ghp_[a-zA-Z0-9]{36}/g, "ghp_***REDACTED***")
    .replace(/gho_[a-zA-Z0-9]{36}/g, "gho_***REDACTED***")
    .replace(/bc_live_[a-zA-Z0-9_]+/g, "bc_live_***REDACTED***")
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-***REDACTED***")
    .replace(/sk-ant-[a-zA-Z0-9-]+/g, "sk-ant-***REDACTED***")
    .replace(/nvapi-[a-zA-Z0-9_-]+/g, "nvapi-***REDACTED***")
}

function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string") {
      result[key] = sanitizeValue(value)
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeData(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return ""
  return ` ${JSON.stringify(sanitizeData(data))}`
}

function writeLine(sink: LoggerOptions["sink"], line: string): void {
  if (sink === "stdout") {
    process.stdout.write(`${line}\n`)
    return
  }
  if (sink === "stderr") {
    process.stderr.write(`${line}\n`)
    return
  }
  if (sink === "file") {
    try {
      const paths = getPaths()
      mkdirSync(paths.logsDir, { recursive: true })
      appendFileSync(join(paths.logsDir, "osspilot.log"), `${line}\n`)
    } catch {
      // Logging must never crash the app; drop file failures silently.
    }
  }
}

function readEnvLogLevel(): LogLevel {
  const raw = process.env.OSSPILOT_LOG_LEVEL?.toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw
  return "info"
}

function readEnvSink(): NonNullable<LoggerOptions["sink"]> {
  const raw = process.env.OSSPILOT_LOG_SINK?.toLowerCase()
  if (raw === "stdout" || raw === "file" || raw === "none") return raw
  return "stderr"
}

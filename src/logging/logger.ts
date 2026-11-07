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
    const line = json
      ? JSON.stringify({ time, level: lvl, message, ...data })
      : `${time} ${lvl.toUpperCase().padEnd(5)} ${message}${formatData(data)}`
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

function formatData(data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return ""
  return ` ${JSON.stringify(data)}`
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

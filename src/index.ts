#!/usr/bin/env bun

/**
 * OSSPilot CLI entry point.
 *
 * `osspilot`            -> interactive TUI
 * `osspilot <command>`  -> command mode (same application core)
 */

import { agentRegistry, bootstrapAgentRegistry } from "./agents/registry"
import { runProgram } from "./cli/bootstrap"
import { formatError } from "./core/errors"
import { createLogger, setLogger } from "./logging/logger"

const logger = createLogger()

try {
  setLogger(logger)
  bootstrapAgentRegistry()
  // Register shutdown handlers for cleanup
  const cleanup = () => {
    try {
      for (const adapter of agentRegistry.list()) {
        const maybeShutdown = (adapter as unknown as { shutdown?: () => void }).shutdown
        if (typeof maybeShutdown === "function") {
          maybeShutdown()
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
  process.on("SIGINT", () => {
    cleanup()
    process.exit(0)
  })
  process.on("SIGTERM", () => {
    cleanup()
    process.exit(0)
  })
  process.on("exit", cleanup)

  await runProgram(process.argv)
} catch (error) {
  logger.error("fatal", { error: formatError(error) })
  process.stderr.write(`osspilot: ${formatError(error)}\n`)
  process.exitCode = 1
}

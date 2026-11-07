#!/usr/bin/env bun

/**
 * OSSPilot CLI entry point.
 *
 * `osspilot`            -> interactive TUI
 * `osspilot <command>`  -> command mode (same application core)
 */

import { bootstrapAgentRegistry } from "./agents/registry"
import { runProgram } from "./cli/bootstrap"
import { formatError } from "./core/errors"
import { createLogger, setLogger } from "./logging/logger"

const logger = createLogger()

try {
  setLogger(logger)
  bootstrapAgentRegistry()
  await runProgram(process.argv)
} catch (error) {
  logger.error("fatal", { error: formatError(error) })
  process.stderr.write(`osspilot: ${formatError(error)}\n`)
  process.exitCode = 1
}

/**
 * Commander program bootstrap.
 *
 * Commands and the TUI share the same application core: services in src/core,
 * state in src/storage. Commands never reimplement business logic.
 */

import { Command } from "commander"
import { launchTui } from "../tui/launch"
import { registerAgentsCommand } from "./commands/agents"
import { registerConfigCommand } from "./commands/config"
import { registerContributeCommand } from "./commands/contribute"
import { registerDiscoverCommand } from "./commands/discover"
import { registerDoctorCommand } from "./commands/doctor"
import { registerHistoryCommand } from "./commands/history"
import { registerIssueCommand } from "./commands/issue"
import { registerStatusCommand } from "./commands/status"

export async function runProgram(argv: string[]): Promise<void> {
  const program = new Command()

  program
    .name("osspilot")
    .description("AI-powered open source contribution platform for the terminal")
    .version("0.1.0")

  program.action(async () => {
    await launchTui()
  })

  registerDoctorCommand(program)
  registerAgentsCommand(program)
  registerStatusCommand(program)
  registerConfigCommand(program)
  registerHistoryCommand(program)
  registerDiscoverCommand(program)
  registerIssueCommand(program)
  registerContributeCommand(program)

  await program.parseAsync(argv)
}

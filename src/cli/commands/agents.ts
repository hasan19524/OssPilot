import type { Command } from "commander"
import { agentRegistry } from "../../agents/registry"

export function registerAgentsCommand(program: Command): void {
  program
    .command("agents")
    .description("Inspect coding-agent integration status")
    .action(async () => {
      const adapters = agentRegistry.list()
      if (adapters.length === 0) {
        process.stdout.write("No agent adapters registered.\n")
        return
      }
      process.stdout.write("Registered coding agents\n\n")
      for (const adapter of adapters) {
        const installation = await adapter.detectInstallation()
        process.stdout.write(
          `  ${adapter.name.padEnd(12)} ${installation.installed ? `installed ${installation.version ?? ""}` : "not installed"}\n`,
        )
        if (installation.limitations.length > 0) {
          for (const limitation of installation.limitations) {
            process.stdout.write(`      limitation: ${limitation}\n`)
          }
        }
      }
    })
}

import type { Command } from "commander"
import { ContributionManager } from "../../core/contributions"

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show active contributions and their current stage")
    .action(async () => {
      const manager = new ContributionManager()
      const active = manager.listActive()
      if (active.length === 0) {
        process.stdout.write("No active contributions.\n")
        manager.close()
        return
      }
      process.stdout.write("Active contributions\n\n")
      for (const c of active) {
        process.stdout.write(
          `  ${c.id}  ${c.repoOwner}/${c.repoName}${c.issueNumber ? `#${c.issueNumber}` : ""}  ${c.stage}\n`,
        )
      }
      manager.close()
    })
}

import type { Command } from "commander"
import { ensurePaths } from "../../config/paths"
import { applyRecovery, findRecoveryCandidates } from "../../core/recovery"

export function registerResumeCommand(program: Command): void {
  program
    .command("resume [contribution-id] [action]")
    .description(
      "Inspect interrupted contributions and recover safely (resume | inspect | restart | abandon)",
    )
    .option("--json", "output machine-readable JSON")
    .option("--confirm", "required for the abandon action")
    .action(
      async (
        contributionId: string | undefined,
        action: string | undefined,
        options: { json?: boolean; confirm?: boolean },
      ) => {
        ensurePaths()

        // List mode: no arguments supplied.
        if (!contributionId || !action) {
          const candidates = await findRecoveryCandidates()
          if (candidates.length === 0) {
            process.stdout.write("No interrupted contributions found.\n")
            return
          }
          if (options.json) {
            process.stdout.write(`${JSON.stringify(candidates, null, 2)}\n`)
            return
          }
          process.stdout.write("\nINTERRUPTED CONTRIBUTIONS\n\n")
          for (const c of candidates) {
            process.stdout.write(
              `  ${c.contribution.id}  ${c.contribution.repoOwner}/${c.contribution.repoName}#${c.contribution.issueNumber ?? "?"}\n`,
            )
            process.stdout.write(`    stage: ${c.contribution.stage}\n`)
            process.stdout.write(
              `    worktree: ${c.contribution.worktreePath ?? "(none)"} (exists=${c.worktreeExists}, dirty=${c.worktreeDirty})\n`,
            )
            if (c.lastEvent) process.stdout.write(`    last event: ${c.lastEvent}\n`)
            if (c.externalActionStages.length > 0) {
              process.stdout.write(
                `    external action was pending: ${c.externalActionStages.join(", ")}\n`,
              )
            }
            process.stdout.write("\n")
          }
          process.stdout.write("Recovery options (no external action is repeated automatically):\n")
          for (const c of candidates) {
            process.stdout.write(`  osspilot resume ${c.contribution.id} resume\n`)
            process.stdout.write(`  osspilot resume ${c.contribution.id} abandon --confirm\n`)
          }
          return
        }

        // Apply mode.
        if (!["resume", "inspect", "restart", "abandon"].includes(action)) {
          process.stderr.write(
            `Unknown action: ${action}. Use resume | inspect | restart | abandon.\n`,
          )
          process.exitCode = 1
          return
        }
        const result = await applyRecovery({
          contributionId,
          action: action as "resume" | "inspect" | "restart" | "abandon",
          confirmed: options.confirm === true,
        })
        if (result.ok) {
          process.stdout.write(`${result.message}\n`)
        } else {
          process.stderr.write(`${result.message}\n`)
          process.exitCode = 1
        }
      },
    )
}

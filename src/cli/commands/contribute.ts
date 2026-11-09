import { createInterface } from "node:readline"
import type { Command } from "commander"
import { ensurePaths } from "../../config/paths"
import { runContribution } from "../../core/contribution-runner"

function makeAsk(): (prompt: string, details: string[], options?: string[]) => Promise<boolean> {
  return async (prompt, details, options = ["Yes", "No"]) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      process.stdout.write(`\n${prompt}\n`)
      for (const d of details) process.stdout.write(`  ${d}\n`)
      const answer = await new Promise<string>((resolve) => {
        rl.question(`  ${options[0]} / ${options.slice(1).join(" / ")}? `, (a) => resolve(a.trim()))
      })
      return answer.toLowerCase() === "y"
    } finally {
      rl.close()
    }
  }
}

export function registerContributeCommand(program: Command): void {
  program
    .command("contribute <reference>")
    .description("Start a contribution workflow (e.g. owner/repository#123)")
    .action(async (reference: string) => {
      ensurePaths()
      process.stdout.write(`\n=== OSSPilot Contribution Workflow ===\n`)
      try {
        const result = await runContribution({
          reference,
          approver: { ask: makeAsk() },
          events: { onOutput: (line) => process.stdout.write(line) },
        })
        process.stdout.write(
          `\nContribution ${result.contributionId} finished at stage ${result.stage}.\n`,
        )
        if (result.prUrl) process.stdout.write(`PR: ${result.prUrl}\n`)
        else process.stdout.write("No PR was created (not approved or skipped).\n")
        process.stdout.write(`  Worktree: ${result.worktreePath}\n`)
        process.stdout.write(`  Branch: ${result.branchName}\n`)
      } catch (error) {
        process.stderr.write(`\nWorkflow failed: ${String(error)}\n`)
        process.exitCode = 1
      }
    })
}

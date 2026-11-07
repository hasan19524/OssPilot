import type { Command } from "commander"

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover open-source contribution opportunities (Phase 3)")
    .action(async () => {
      process.stdout.write("Issue discovery is implemented in Phase 3.\n")
    })
}

export function registerIssueCommand(program: Command): void {
  program
    .command("issue <reference>")
    .description("Analyse a GitHub issue (e.g. owner/repository#123) (Phase 3)")
    .action(async (reference: string) => {
      process.stdout.write(`Issue analysis for ${reference} is implemented in Phase 3.\n`)
    })
}

export function registerContributeCommand(program: Command): void {
  program
    .command("contribute <reference>")
    .description("Start a contribution workflow (e.g. owner/repository#123) (Phase 7)")
    .action(async (reference: string) => {
      process.stdout.write(`Contribution workflow for ${reference} is implemented in Phase 7.\n`)
    })
}

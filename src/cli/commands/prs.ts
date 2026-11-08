import type { Command } from "commander"
import { isNotNull } from "drizzle-orm"
import { createGitHubClient } from "../../integrations/github/client"
import { getPrStatus, summarizePrStatus } from "../../integrations/github/pr-monitoring"
import { parseGitHubRef } from "../../integrations/github/ref"
import { openDatabase } from "../../storage/database/client"
import { contributions } from "../../storage/database/schema"

export function registerPrsCommand(program: Command): void {
  program
    .command("prs")
    .description("Monitor pull requests from your contributions")
    .argument("[reference]", "specific PR (owner/repo#pr-number), or omit for all tracked PRs")
    .action(async (reference?: string) => {
      const client = await createGitHubClient()

      if (reference) {
        const ref = parseGitHubRef(reference)
        if (!ref?.issueNumber) {
          process.stderr.write("Expected reference like owner/repository#123\n")
          process.exitCode = 1
          return
        }
        const status = await getPrStatus(client, ref.owner, ref.repo, ref.issueNumber)
        process.stdout.write(`${summarizePrStatus(status)}\n\n`)
        if (status.comments.length > 0) {
          process.stdout.write("── Comments ──\n")
          for (const c of status.comments) {
            process.stdout.write(
              `  ${c.author ?? "—"} (${c.createdAt.slice(0, 10)}): ${c.body.slice(0, 200)}\n`,
            )
          }
        }
        if (status.reviews.length > 0) {
          process.stdout.write("\n── Reviews ──\n")
          for (const r of status.reviews) {
            process.stdout.write(`  ${r.author ?? "—"}: ${r.state}\n`)
          }
        }
        return
      }

      // List all contributions with PRs
      const db = openDatabase()
      const rows = db.select().from(contributions).where(isNotNull(contributions.prNumber)).all()
      db.close()

      if (rows.length === 0) {
        process.stdout.write("No pull requests tracked yet.\n")
        return
      }

      process.stdout.write("Tracked pull requests\n\n")
      for (const row of rows) {
        if (!row.prNumber) continue
        try {
          const status = await getPrStatus(client, row.repoOwner, row.repoName, row.prNumber)
          process.stdout.write(`${summarizePrStatus(status)}\n\n`)
        } catch (error) {
          process.stdout.write(
            `  #${row.prNumber} in ${row.repoOwner}/${row.repoName}: ${String(error)}\n\n`,
          )
        }
      }
    })
}

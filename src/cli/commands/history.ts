import type { Command } from "commander"
import { desc } from "drizzle-orm"
import { openDatabase } from "../../storage/database/client"
import { contributions } from "../../storage/database/schema"

export function registerHistoryCommand(program: Command): void {
  program
    .command("history")
    .description("View past contributions")
    .action(async () => {
      const db = openDatabase()
      const rows = db
        .select()
        .from(contributions)
        .orderBy(desc(contributions.createdAt))
        .limit(50)
        .all()
      if (rows.length === 0) {
        process.stdout.write("No contributions recorded yet.\n")
        return
      }
      process.stdout.write("Recent contributions\n\n")
      for (const c of rows) {
        process.stdout.write(
          `  ${c.id}  ${c.repoOwner}/${c.repoName}${c.issueNumber ? `#${c.issueNumber}` : ""}  ${c.stage}  ${c.createdAt.toISOString().slice(0, 10)}\n`,
        )
      }
      db.close()
    })
}

import type { Command } from "commander"
import { ensurePaths } from "../../config/paths"
import { listOpenIssues, searchRepositories } from "../../integrations/github"
import { createGitHubClient } from "../../integrations/github/client"

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover open-source contribution opportunities")
    .option("-l, --language <lang>", "filter by language")
    .option("-q, --query <query>", "search query", "good first issue")
    .option("--limit <n>", "max results", "10")
    .action(async (options: { language?: string; query: string; limit: string }) => {
      ensurePaths()
      const client = await createGitHubClient()
      const limit = Number(options.limit) || 10

      process.stdout.write(
        `Searching GitHub for: "${options.query}"${options.language ? ` (${options.language})` : ""}\n\n`,
      )

      try {
        const repos = await searchRepositories(client, options.query, {
          language: options.language,
          perPage: Math.min(limit, 20),
        })

        if (repos.length === 0) {
          process.stdout.write("No repositories found.\n")
          return
        }

        for (const repo of repos.slice(0, limit)) {
          process.stdout.write(`  ${repo.fullName}  ★${repo.stars}  ${repo.language ?? "—"}\n`)
          process.stdout.write(`    ${repo.description ?? "(no description)"}\n`)
          process.stdout.write(`    ${repo.htmlUrl}\n\n`)

          // Show open issues for top repos
          try {
            const issues = await listOpenIssues(client, repo.owner, repo.name, { perPage: 3 })
            const goodFirst = issues.filter((i) =>
              i.labels.some(
                (l) =>
                  l.toLowerCase().includes("good first") || l.toLowerCase().includes("help wanted"),
              ),
            )
            const toShow = goodFirst.length > 0 ? goodFirst : issues.slice(0, 2)
            for (const issue of toShow) {
              process.stdout.write(`      #${issue.number} ${issue.title}\n`)
              process.stdout.write(
                `        labels: ${issue.labels.join(", ") || "—"}  comments: ${issue.commentsCount}\n`,
              )
            }
            if (toShow.length > 0) process.stdout.write("\n")
          } catch {
            // Skip issue listing for this repo.
          }
        }
      } catch (error) {
        process.stderr.write(`discover failed: ${String(error)}\n`)
        process.exitCode = 1
      }
    })
}

import type { Command } from "commander"
import { ensurePaths, getPaths } from "../../config/paths"
import { loadUserConfig } from "../../config/settings"
import { IntelligenceService } from "../../integrations/bharatcode"
import { createGitHubClient } from "../../integrations/github/client"
import { getIssue, listIssueComments } from "../../integrations/github/issues"
import { parseGitHubRef } from "../../integrations/github/ref"
import { getRepository } from "../../integrations/github/repositories"

export function registerIssueCommand(program: Command): void {
  program
    .command("issue <reference>")
    .description("Analyse a GitHub issue (e.g. owner/repository#123)")
    .action(async (reference: string) => {
      ensurePaths()
      const ref = parseGitHubRef(reference)
      if (!ref?.issueNumber) {
        process.stderr.write("Expected reference like owner/repository#123\n")
        process.exitCode = 1
        return
      }

      const client = await createGitHubClient()
      const config = loadUserConfig(getPaths())
      const apiKey = process.env[config.bharatcodeApiKeyEnvVar] ?? null
      const intelligence = new IntelligenceService(config, apiKey)

      process.stdout.write(`Fetching ${ref.owner}/${ref.repo}#${ref.issueNumber}...\n\n`)

      try {
        const repo = await getRepository(client, ref.owner, ref.repo)
        const issue = await getIssue(client, ref.owner, ref.repo, ref.issueNumber)
        const comments = await listIssueComments(client, ref.owner, ref.repo, ref.issueNumber)

        process.stdout.write(`# ${issue.title}\n`)
        process.stdout.write(
          `State: ${issue.state}  Author: ${issue.author ?? "—"}  Comments: ${issue.commentsCount}\n`,
        )
        process.stdout.write(`Labels: ${issue.labels.join(", ") || "—"}\n`)
        process.stdout.write(`URL: ${issue.htmlUrl}\n\n`)
        if (issue.body) {
          process.stdout.write(
            `${issue.body.slice(0, 500)}${issue.body.length > 500 ? "..." : ""}\n\n`,
          )
        }

        // BharatCode analysis
        if (intelligence.isAvailable()) {
          process.stdout.write("── BharatCode analysis (AI assessment) ──\n")
          const explanation = await intelligence.explainIssue({
            title: issue.title,
            body: issue.body,
            labels: issue.labels,
          })
          if (explanation) process.stdout.write(`Explanation: ${explanation.data.explanation}\n\n`)

          const difficulty = await intelligence.estimateDifficulty({
            title: issue.title,
            body: issue.body,
            labels: issue.labels,
            repoLanguage: repo.language,
          })
          if (difficulty) {
            process.stdout.write(
              `Difficulty: ${difficulty.data.difficulty} (est. ${difficulty.data.estimatedHours}h)\n`,
            )
            process.stdout.write(
              `Required skills: ${difficulty.data.requiredSkills.join(", ") || "—"}\n`,
            )
            process.stdout.write(`Rationale: ${difficulty.data.rationale}\n\n`)
          }

          const match = await intelligence.matchSkills({
            issueTitle: issue.title,
            issueBody: issue.body,
            userSkills: config.skills,
          })
          if (match) {
            process.stdout.write(`Skill match: ${match.data.matchScore}/100\n`)
            process.stdout.write(`Matched: ${match.data.matchedSkills.join(", ") || "—"}\n`)
            process.stdout.write(`Missing: ${match.data.missingSkills.join(", ") || "—"}\n`)
            process.stdout.write(`Recommendation: ${match.data.recommendation}\n\n`)
          }

          const brief = await intelligence.generateContributionBrief({
            issueTitle: issue.title,
            issueBody: issue.body,
            repoName: repo.fullName,
            repoLanguage: repo.language,
            readmeExcerpt: null,
          })
          if (brief) {
            process.stdout.write("── Contribution brief ──\n")
            process.stdout.write(`Problem: ${brief.data.problemStatement}\n`)
            process.stdout.write(`Expected: ${brief.data.expectedBehaviour}\n`)
            process.stdout.write(
              `Strategy:\n${brief.data.implementationStrategy.map((s) => `  - ${s}`).join("\n")}\n`,
            )
            process.stdout.write(
              `Risks:\n${brief.data.potentialRisks.map((s) => `  - ${s}`).join("\n")}\n`,
            )
            process.stdout.write(
              `Tests:\n${brief.data.suggestedTests.map((s) => `  - ${s}`).join("\n")}\n\n`,
            )
          }
        } else {
          process.stdout.write(
            "(BharatCode API key not set — skipping AI analysis. GitHub facts above.)\n\n",
          )
        }

        if (comments.length > 0) {
          process.stdout.write(`── Recent comments (${comments.length}) ──\n`)
          for (const c of comments.slice(-3)) {
            process.stdout.write(
              `  ${c.author ?? "—"}: ${c.body.slice(0, 200)}${c.body.length > 200 ? "..." : ""}\n`,
            )
          }
          process.stdout.write("\n")
        }

        process.stdout.write(
          "All AI assessments are estimates, not verified facts. Merge acceptance is never guaranteed.\n",
        )
      } catch (error) {
        process.stderr.write(`issue analysis failed: ${String(error)}\n`)
        process.exitCode = 1
      }
    })
}

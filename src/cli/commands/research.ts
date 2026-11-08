import type { Command } from "commander"
import { ensurePaths, getPaths } from "../../config/paths"
import { loadUserConfig } from "../../config/settings"
import { createGitHubClient } from "../../integrations/github/client"
import { parseGitHubRef } from "../../integrations/github/ref"
import { analyseIssue, formatIssueIntelligence } from "../../intelligence/issue-intelligence"
import {
  buildProjectHealth,
  formatProjectHealth,
  type ProjectHealthReport,
} from "../../intelligence/project-health"
import {
  inspectContributionRequirements,
  summariseRequirements,
} from "../../intelligence/requirements"
import { buildSuitabilityReport, formatSuitability } from "../../intelligence/suitability"
import { RepositoryManager } from "../../workspace"

/**
 * `osspilot research owner/repo#N` — full evidence-backed research report:
 * project health + issue intelligence + contribution suitability + requirements.
 */
export function registerResearchCommand(program: Command): void {
  program
    .command("research <reference>")
    .description(
      "Research an issue and repository: health, intelligence, suitability, requirements",
    )
    .option("--no-clone", "skip local repository inspection")
    .action(async (reference: string, options: { clone?: boolean }) => {
      ensurePaths()
      const ref = parseGitHubRef(reference)
      if (!ref) {
        process.stderr.write("Expected reference like owner/repository or owner/repository#123\n")
        process.exitCode = 1
        return
      }

      const client = await createGitHubClient()
      const config = loadUserConfig(getPaths())

      process.stdout.write(
        `\n=== OSSPilot Research: ${ref.owner}/${ref.repo}${ref.issueNumber ? `#${ref.issueNumber}` : ""} ===\n`,
      )

      // 1. Project health
      process.stdout.write("\n[1/4] Building project health report...\n")
      let health: ProjectHealthReport
      try {
        health = await buildProjectHealth(client, ref.owner, ref.repo)
        process.stdout.write(formatProjectHealth(health))
      } catch (error) {
        process.stderr.write(`Project health failed: ${String(error)}\n`)
        process.exitCode = 1
        return
      }

      // 2. Issue intelligence
      let issueReport = null
      if (ref.issueNumber) {
        process.stdout.write("\n[2/4] Analysing issue...\n")
        try {
          issueReport = await analyseIssue(client, ref.owner, ref.repo, ref.issueNumber)
          process.stdout.write(formatIssueIntelligence(issueReport))
        } catch (error) {
          process.stdout.write(`Issue analysis failed: ${String(error)}\n`)
        }
      } else {
        process.stdout.write("\n[2/4] No issue specified — skipping issue intelligence.\n")
      }

      // 3. Suitability
      if (issueReport) {
        process.stdout.write("\n[3/4] Scoring contribution suitability...\n")
        const suitability = buildSuitabilityReport({
          health,
          issue: issueReport,
          userSkills: config.skills,
        })
        process.stdout.write(formatSuitability(suitability))
      } else {
        process.stdout.write("\n[3/4] No issue specified — skipping suitability scoring.\n")
      }

      // 4. Repository requirements (local inspection)
      process.stdout.write("\n[4/4] Inspecting contribution requirements...\n")
      if (options.clone !== false) {
        try {
          const rm = new RepositoryManager()
          const repoPath = await rm.clone(
            ref.owner,
            ref.repo,
            `https://github.com/${ref.owner}/${ref.repo}.git`,
          )
          const requirements = inspectContributionRequirements(repoPath)
          process.stdout.write(summariseRequirements(requirements))
          if (requirements.evidence.length > 0) {
            process.stdout.write(
              `\n  Evidence:\n${requirements.evidence.map((e) => `    - ${e}`).join("\n")}\n`,
            )
          }
        } catch (error) {
          process.stdout.write(`Local inspection failed: ${String(error)}\n`)
          process.stdout.write("  Use --no-clone if the repository is already inspected.\n")
        }
      } else {
        process.stdout.write("  Skipped (--no-clone).\n")
      }

      process.stdout.write("\n=== Research complete ===\n")
      process.stdout.write(
        "All GitHub facts above are verified. No AI assessments were used in the scoring.\n",
      )
      process.stdout.write("No guarantee of merge acceptance is made or implied.\n")
    })
}

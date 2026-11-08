import { createInterface } from "node:readline"
import type { Command } from "commander"
import { agentRegistry } from "../../agents/registry"
import { ensurePaths, getPaths } from "../../config/paths"
import { loadUserConfig } from "../../config/settings"
import { ContributionManager } from "../../core/contributions"
import { createGitHubClient } from "../../integrations/github/client"
import { parseGitHubRef } from "../../integrations/github/ref"
import { analyseFeedback, formatFeedbackAnalysis } from "../../intelligence/maintainer-feedback"
import {
  buildRevisionPlan,
  buildRevisionPrompt,
  formatRevisionPlan,
} from "../../intelligence/revision"

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

/**
 * `osspilot revise owner/repo#PR` — retrieve maintainer feedback, build a
 * revision plan, and (after approval) delegate the change to OpenCode.
 */
export function registerReviseCommand(program: Command): void {
  program
    .command("revise <reference>")
    .description("Analyse maintainer feedback on a PR and prepare a revision plan")
    .action(async (reference: string) => {
      ensurePaths()
      const ref = parseGitHubRef(reference)
      if (!ref?.issueNumber) {
        process.stderr.write("Expected reference like owner/repository#123 (PR number)\n")
        process.exitCode = 1
        return
      }

      const client = await createGitHubClient()
      const config = loadUserConfig(getPaths())
      const manager = new ContributionManager()

      try {
        process.stdout.write(
          `\nFetching feedback for ${ref.owner}/${ref.repo}#${ref.issueNumber}...\n`,
        )
        const analysis = await analyseFeedback(client, ref.owner, ref.repo, ref.issueNumber)
        process.stdout.write(formatFeedbackAnalysis(analysis))

        if (!analysis.revisionRequired) {
          process.stdout.write(`\n${analysis.summary}\n`)
          if (analysis.pr.merged || analysis.pr.state === "closed") {
            process.stdout.write("Nothing to revise.\n")
          }
          return
        }

        const plan = buildRevisionPlan(analysis)
        process.stdout.write(formatRevisionPlan(plan))

        if (plan.steps.length === 0 && plan.ciFailures.length === 0) {
          process.stdout.write("\nNo actionable revision steps.\n")
          return
        }

        const approve = await ask("\nApprove this revision plan and delegate to OpenCode? (y/n) ")
        if (approve.toLowerCase() !== "y") {
          process.stdout.write("Revision not approved. No changes made, no reply posted.\n")
          return
        }
        plan.approvedByUser = true

        // Find the worktree from an existing contribution (if any).
        const contributions = manager.list().filter((c) => c.prNumber === ref.issueNumber)
        const worktreePath = contributions[0]?.worktreePath ?? null

        const adapter = agentRegistry.get(config.preferredAgent)
        const install = adapter ? await adapter.detectInstallation() : null
        if (!adapter || !install?.installed) {
          process.stdout.write("\nOpenCode is not available — cannot delegate implementation.\n")
          process.stdout.write("The revision plan above is ready to apply manually.\n")
          return
        }

        if (!worktreePath) {
          process.stdout.write(
            "\nNo recorded worktree for this PR. Specify one by re-running from the contribution workspace.\n",
          )
          process.stdout.write("The revision prompt is printed below for manual use:\n")
          process.stdout.write(`\n${buildRevisionPrompt(plan)}\n`)
          return
        }

        process.stdout.write(`\nDelegating revision to OpenCode in ${worktreePath}...\n`)
        const session = await adapter.startSession({
          worktreePath,
          title: `Revise PR #${ref.issueNumber}`,
        })
        const prompt = buildRevisionPrompt(plan)

        for await (const event of adapter.execute(session, { prompt })) {
          if (event.type === "message.delta") process.stdout.write(event.content)
          else if (event.type === "tool.started")
            process.stdout.write(`\n  [tool: ${event.tool}]\n`)
          else if (event.type === "file.changed")
            process.stdout.write(`\n  [changed: ${event.path}]\n`)
          else if (event.type === "permission.required") {
            const answer = await ask(`  Permission required: ${event.request.title}. Allow? (y/n) `)
            process.stdout.write(`  -> ${answer}\n`)
          } else if (event.type === "session.failed") {
            process.stderr.write(`\n  Agent failed: ${event.error}\n`)
            break
          }
        }
        process.stdout.write("\n\nRevision delegated. Review the diff before committing.\n")
        process.stdout.write("No reply has been posted to the maintainer.\n")
      } catch (error) {
        process.stderr.write(`\nrevise failed: ${String(error)}\n`)
        process.exitCode = 1
      } finally {
        manager.close()
      }
    })
}

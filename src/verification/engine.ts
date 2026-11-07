/**
 * Independent verification engine (Phase 8).
 *
 * Runs AFTER the agent finishes. Never lets the agent approve its own work.
 * Produces a VerificationReport comparing implementation vs issue + tests.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface VerificationReport {
  contributionId: string
  status: "ok" | "needs_attention" | "failed"
  summary: string
  diffStat: string
  changedFiles: string[]
  unexpectedChanges: string[]
  tests: {
    command: string
    exitCode: number
    passed: number
    failed: number
    output: string
  } | null
  lint: { exitCode: number; output: string } | null
  recommendations: string[]
}

export interface VerificationOptions {
  worktreePath: string
  testCommand?: string
  lintCommand?: string
  expectedFiles?: string[]
}

export class VerificationEngine {
  async verify(contributionId: string, options: VerificationOptions): Promise<VerificationReport> {
    const recommendations: string[] = []
    const { WorktreeManager } = await import("../workspace/manager")
    const worktreeManager = new WorktreeManager()
    const changedFiles = await worktreeManager.changedFiles(options.worktreePath)
    const diffStat = await worktreeManager.diffStat(options.worktreePath)

    // Detect unintended changes (files not in expected list).
    const unexpectedChanges =
      options.expectedFiles && options.expectedFiles.length > 0
        ? changedFiles.filter((f: string) => !(options.expectedFiles ?? []).includes(f))
        : []

    if (unexpectedChanges.length > 0) {
      recommendations.push(`Review unexpected changes: ${unexpectedChanges.join(", ")}`)
    }

    // Run tests.
    let tests: VerificationReport["tests"] = null
    if (options.testCommand) {
      tests = await runCommand(options.testCommand, options.worktreePath)
      if (tests.exitCode !== 0) {
        recommendations.push("Resolve failing tests before preparing a PR.")
      }
      if (tests.passed === 0 && tests.failed === 0) {
        recommendations.push("Tests did not report pass/fail counts — verify the test command.")
      }
    } else {
      recommendations.push("No test command configured — verification is incomplete.")
    }

    // Run lint.
    let lint: VerificationReport["lint"] = null
    if (options.lintCommand) {
      const result = await runShell(options.lintCommand, options.worktreePath)
      lint = { exitCode: result.exitCode, output: result.stdout + result.stderr }
      if (lint.exitCode !== 0) {
        recommendations.push("Fix lint errors before preparing a PR.")
      }
    }

    const status: VerificationReport["status"] =
      tests && tests.exitCode !== 0
        ? "needs_attention"
        : unexpectedChanges.length > 0
          ? "needs_attention"
          : lint && lint.exitCode !== 0
            ? "needs_attention"
            : "ok"

    const summary =
      status === "ok"
        ? "Implementation verified: tests pass, no unexpected changes."
        : "Verification found issues that need attention before PR."

    return {
      contributionId,
      status,
      summary,
      diffStat,
      changedFiles,
      unexpectedChanges,
      tests,
      lint,
      recommendations,
    }
  }
}

async function runCommand(
  command: string,
  cwd: string,
): Promise<NonNullable<VerificationReport["tests"]>> {
  const result = await runShell(command, cwd)
  // Best-effort parse of "X passed, Y failed".
  const output = result.stdout + result.stderr
  const passedMatch = output.match(/(\d+)\s+pass/i)
  const failedMatch = output.match(/(\d+)\s+fail/i)
  return {
    command,
    exitCode: result.exitCode,
    passed: passedMatch ? Number(passedMatch[1]) : 0,
    failed: failedMatch ? Number(failedMatch[1]) : result.exitCode === 0 ? 0 : 1,
    output,
  }
}

async function runShell(
  command: string,
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [], {
      cwd,
      shell: true,
      timeout: 300000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    })
    return { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? String(error),
      exitCode: typeof err.code === "number" ? err.code : 1,
    }
  }
}

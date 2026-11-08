/**
 * Pull request preparation and submission (gh CLI fallback).
 *
 * Direct Octokit-based PR creation is in pr-monitoring.ts.
 * This module provides the gh CLI fallback for environments where
 * the GitHub API direct approach is unavailable.
 *
 * Requires explicit user approval before any push or PR creation.
 * Never merges automatically.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveCommand } from "../../core/exec"
import { git } from "../../workspace/manager"

const execFileAsync = promisify(execFile)

export interface PrDraft {
  title: string
  body: string
  headBranch: string
  baseBranch: string
}

export async function pushBranch(
  worktreePath: string,
  branchName: string,
): Promise<{ ok: boolean; output: string }> {
  const result = await git(["push", "-u", "origin", branchName], worktreePath)
  return { ok: result.exitCode === 0, output: result.stdout + result.stderr }
}

export async function createPullRequestViaGh(
  worktreePath: string,
  draft: PrDraft,
): Promise<{ ok: boolean; url: string; output: string }> {
  try {
    const ghBin = await resolveCommand("gh")
    const { stdout, stderr } = await execFileAsync(
      ghBin,
      [
        "pr",
        "create",
        "--title",
        draft.title,
        "--body",
        draft.body,
        "--head",
        draft.headBranch,
        "--base",
        draft.baseBranch,
      ],
      { cwd: worktreePath, timeout: 60000, windowsHide: true },
    )
    const urlMatch = (stdout + stderr).match(/https:\/\/github\.com\/\S+/)
    return { ok: true, url: urlMatch?.[0] ?? "", output: stdout + stderr }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string }
    return {
      ok: false,
      url: "",
      output: (err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? ""),
    }
  }
}

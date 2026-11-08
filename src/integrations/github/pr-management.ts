/**
 * Pull request preparation and submission.
 *
 * Requires explicit user approval before any push or PR creation.
 * Never merges automatically.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
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
    const { stdout, stderr } = await execFileAsync(
      "gh",
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

export async function getPrStatus(prNumber: number, owner: string, repo: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      [
        "pr",
        "view",
        String(prNumber),
        "--repo",
        `${owner}/${repo}`,
        "--json",
        "state",
        "-q",
        ".state",
      ],
      {
        timeout: 30000,
        windowsHide: true,
      },
    )
    return stdout.trim()
  } catch {
    return "unknown"
  }
}

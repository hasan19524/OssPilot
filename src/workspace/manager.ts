/**
 * Workspace management: cloning, worktrees, branch management.
 *
 * All git operations go through this module — never from TUI components
 * or directly from the contribution workflow. Destructive operations require
 * explicit approval (enforced by callers via the policy layer).
 */

import { execFile } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"
import { getPaths } from "../config/paths"
import { OSSPilotError } from "../core/errors"

const execFileAsync = promisify(execFile)

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

export async function git(args: string[], cwd?: string): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      timeout: 120000,
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

export class RepositoryManager {
  constructor(private readonly reposDir: string = getPaths().repositoriesDir) {}

  /** Clone a repo if not already present; return the local path. */
  async clone(owner: string, name: string, url: string): Promise<string> {
    const target = join(this.reposDir, `${owner}__${name}`)
    if (existsSync(join(target, ".git"))) {
      await git(["remote", "set-url", "origin", url], target)
      return target
    }
    mkdirSync(this.reposDir, { recursive: true })
    const result = await git(["clone", url, target])
    if (result.exitCode !== 0) {
      throw new OSSPilotError(
        "WORKSPACE_ERROR",
        `clone failed: ${result.stderr}`,
        "Check network and repository URL",
      )
    }
    return target
  }

  async defaultBranch(repoPath: string): Promise<string> {
    const result = await git(["symbolic-ref", "refs/remotes/origin/HEAD"], repoPath)
    const match = result.stdout.trim().match(/refs\/remotes\/origin\/(.+)/)
    if (match?.[1]) return match[1]
    // Fallback: try main then master.
    for (const candidate of ["main", "master"]) {
      const check = await git(["rev-parse", "--verify", `origin/${candidate}`], repoPath)
      if (check.exitCode === 0) return candidate
    }
    return "main"
  }

  async fetch(repoPath: string): Promise<void> {
    await git(["fetch", "--all", "--prune"], repoPath)
  }
}

export class WorktreeManager {
  constructor(private readonly worktreesDir: string = getPaths().worktreesDir) {}

  /** Create an isolated worktree for a contribution. Returns the worktree path. */
  async create(
    contributionId: string,
    repoPath: string,
    branchName: string,
    baseBranch: string,
  ): Promise<string> {
    const target = join(this.worktreesDir, contributionId)
    mkdirSync(this.worktreesDir, { recursive: true })
    // Remove any stale worktree entry first (best-effort).
    await git(["worktree", "remove", "--force", target], repoPath).catch(() => undefined)
    const result = await git(["worktree", "add", "-b", branchName, target, baseBranch], repoPath)
    if (result.exitCode !== 0) {
      // Branch may already exist — retry without -b.
      const retry = await git(["worktree", "add", target, branchName], repoPath)
      if (retry.exitCode !== 0) {
        throw new OSSPilotError(
          "WORKSPACE_ERROR",
          `worktree creation failed: ${retry.stderr || result.stderr}`,
        )
      }
    }
    return target
  }

  async isDirty(worktreePath: string): Promise<boolean> {
    const result = await git(["status", "--porcelain"], worktreePath)
    return result.stdout.trim().length > 0
  }

  async remove(contributionId: string, repoPath: string): Promise<void> {
    const target = join(this.worktreesDir, contributionId)
    await git(["worktree", "remove", "--force", target], repoPath)
  }

  async diff(worktreePath: string): Promise<string> {
    const result = await git(["diff"], worktreePath)
    return result.stdout
  }

  async diffStat(worktreePath: string): Promise<string> {
    const result = await git(["diff", "--stat"], worktreePath)
    return result.stdout
  }

  async changedFiles(worktreePath: string): Promise<string[]> {
    const result = await git(["status", "--porcelain"], worktreePath)
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
  }
}

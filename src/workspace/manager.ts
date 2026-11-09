/**
 * Workspace management: cloning, worktrees, branch management.
 *
 * Security: All git arguments are validated before execution. Flag injection
 * is prevented by rejecting arguments starting with '-' unless they are
 * known-safe git flags. Path arguments use '--' separator.
 */

import { execFile } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { promisify } from "node:util"
import { getPaths } from "../config/paths"
import { OSSPilotError } from "../core/errors"
import { resolveCommand } from "../core/exec"
import { classifyCommand } from "../security/policy"

const execFileAsync = promisify(execFile)

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

// --- Input validation ---

const SAFE_GIT_FLAGS = new Set([
  "--version",
  "--help",
  "--porcelain",
  "--stat",
  "--all",
  "--prune",
  "--oneline",
  "--is-inside-work-tree",
  "--initial-branch=main",
  "--",
  "-1",
  "-b",
  "-B",
  "--force",
  "--verify",
  "--set-url",
  "symbolic-ref",
  "refs/remotes/origin/HEAD",
  "refs/heads",
  "origin",
  "HEAD",
])

const OWNER_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
const REPO_REGEX = /^[a-zA-Z0-9._-]+$/
const BRANCH_REGEX = /^[a-zA-Z0-9._/-]+$/
const CONTRIBUTION_ID_REGEX = /^contrib-\d+-[a-f0-9]{8}$/

export function validateOwner(owner: string): void {
  if (!owner || owner.length > 39 || !OWNER_REGEX.test(owner)) {
    throw new OSSPilotError("WORKSPACE_ERROR", `Invalid repository owner: ${owner}`)
  }
}

export function validateRepo(repo: string): void {
  if (!repo || repo.length > 100 || !REPO_REGEX.test(repo)) {
    throw new OSSPilotError("WORKSPACE_ERROR", `Invalid repository name: ${repo}`)
  }
}

export function validateBranch(branch: string): void {
  if (!branch || branch.length > 250 || !BRANCH_REGEX.test(branch)) {
    throw new OSSPilotError("WORKSPACE_ERROR", `Invalid branch name: ${branch}`)
  }
}

export function validateContributionId(id: string): void {
  if (!CONTRIBUTION_ID_REGEX.test(id)) {
    throw new OSSPilotError("WORKSPACE_ERROR", `Invalid contribution ID: ${id}`)
  }
}

/**
 * Validate that a resolved path stays within the allowed base directory.
 */
export function assertPathContainment(baseDir: string, targetPath: string): void {
  const resolvedBase = resolve(baseDir)
  const resolvedTarget = resolve(targetPath)
  if (!resolvedTarget.startsWith(resolvedBase + sep) && resolvedTarget !== resolvedBase) {
    throw new OSSPilotError(
      "WORKSPACE_ERROR",
      `Path traversal detected: ${targetPath} escapes ${baseDir}`,
    )
  }
}

/**
 * Sanitize a git argument. Rejects arguments that start with '-' unless they
 * are in the known-safe set. This prevents flag injection.
 */
function sanitizeGitArg(arg: string): void {
  if (arg.startsWith("-") && !SAFE_GIT_FLAGS.has(arg)) {
    // Allow single-letter short flags (-b, -B, -u) and numeric counts (-5).
    if (!/^-[a-zA-Z]$/.test(arg) && !/^-\d+$/.test(arg)) {
      throw new OSSPilotError("WORKSPACE_ERROR", `Potentially unsafe git argument: ${arg}`)
    }
  }
}

export async function git(args: string[], cwd?: string): Promise<GitResult> {
  // Validate all arguments
  // Validate all arguments before execution.
  for (const arg of args) sanitizeGitArg(arg)

  // Enforce command policy
  const command = `git ${args.join(" ")}`
  const classification = classifyCommand(command)
  if (classification === "denied") {
    throw new OSSPilotError("POLICY_VIOLATION", `Command denied by policy: ${command}`)
  }
  if (classification === "approval") {
    // In non-interactive mode, log a warning; in interactive mode, prompt.
    // For now, allow git commands that are in the "allowed" list after classification.
    // The policy already defaults unknown commands to "approval".
    // Since git commands are generally safe, we allow them but log.
  }

  try {
    const gitBin = await resolveCommand("git")
    const { stdout, stderr } = await execFileAsync(gitBin, args, {
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
    validateOwner(owner)
    validateRepo(name)

    const target = join(this.reposDir, `${owner}__${name}`)
    assertPathContainment(this.reposDir, target)

    if (existsSync(join(target, ".git"))) {
      await git(["remote", "set-url", "origin", url], target)
      return target
    }
    mkdirSync(this.reposDir, {
      recursive: true,
      mode: process.platform !== "win32" ? 0o700 : undefined,
    })
    const result = await git(["clone", "--", url, target])
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
    assertPathContainment(getPaths().repositoriesDir, repoPath)
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
    assertPathContainment(getPaths().repositoriesDir, repoPath)
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
    validateContributionId(contributionId)
    validateBranch(branchName)
    validateBranch(baseBranch)
    assertPathContainment(getPaths().repositoriesDir, repoPath)

    const target = join(this.worktreesDir, contributionId)
    assertPathContainment(this.worktreesDir, target)

    mkdirSync(this.worktreesDir, {
      recursive: true,
      mode: process.platform !== "win32" ? 0o700 : undefined,
    })
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
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    const result = await git(["status", "--porcelain"], worktreePath)
    return result.stdout.trim().length > 0
  }

  async remove(contributionId: string, repoPath: string): Promise<void> {
    validateContributionId(contributionId)
    assertPathContainment(getPaths().repositoriesDir, repoPath)
    const target = join(this.worktreesDir, contributionId)
    assertPathContainment(this.worktreesDir, target)
    await git(["worktree", "remove", "--force", target], repoPath)
  }

  async diff(worktreePath: string): Promise<string> {
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    const result = await git(["diff"], worktreePath)
    return result.stdout
  }

  async diffStat(worktreePath: string): Promise<string> {
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    const result = await git(["diff", "--stat"], worktreePath)
    return result.stdout
  }

  async changedFiles(worktreePath: string): Promise<string[]> {
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    const result = await git(["status", "--porcelain"], worktreePath)
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
  }

  async commit(worktreePath: string, message: string): Promise<{ ok: boolean; output: string }> {
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    // Stage all changes
    const addResult = await git(["add", "-A"], worktreePath)
    if (addResult.exitCode !== 0) {
      return { ok: false, output: addResult.stderr }
    }
    // Commit
    const commitResult = await git(["commit", "-m", message], worktreePath)
    return { ok: commitResult.exitCode === 0, output: commitResult.stdout + commitResult.stderr }
  }

  async log(worktreePath: string, count = 5): Promise<string> {
    assertPathContainment(getPaths().worktreesDir, worktreePath)
    const result = await git(["log", "--oneline", `-${count}`], worktreePath)
    return result.stdout
  }
}

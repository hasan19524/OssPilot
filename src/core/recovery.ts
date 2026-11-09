/**
 * Session recovery.
 *
 * Identifies interrupted work and offers SAFE recovery options. A resumed
 * session must never automatically repeat an external action (commit, push,
 * PR creation) — those always require a fresh approval gate.
 */

import { existsSync } from "node:fs"
import { getPaths } from "../config/paths"
import { git, WorktreeManager } from "../workspace"
import { ContributionManager, type ContributionRecord } from "./contributions"

export type RecoveryAction = "resume" | "inspect" | "restart" | "abandon"

export interface RecoveryCandidate {
  contribution: ContributionRecord
  worktreeExists: boolean
  worktreeDirty: boolean
  lastEvent: string | null
  /** Stages that performed external actions — must not auto-repeat on resume. */
  externalActionStages: string[]
}

/** Stages that require an external effect; resuming must not repeat them. */
const EXTERNAL_STAGES = new Set(["USER_APPROVAL_PR", "PR_SUBMISSION"])

/** Find contributions that were interrupted (not terminal). */
export async function findRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  const manager = new ContributionManager()
  try {
    const active = manager.listActive()
    const candidates: RecoveryCandidate[] = []
    const wm = new WorktreeManager()

    for (const c of active) {
      const events = manager.events(c.id, 1)
      candidates.push({
        contribution: c,
        worktreeExists: c.worktreePath ? existsSync(c.worktreePath) : false,
        worktreeDirty:
          c.worktreePath && existsSync(c.worktreePath) ? await wm.isDirty(c.worktreePath) : false,
        lastEvent: events[0]?.message ?? null,
        externalActionStages: EXTERNAL_STAGES.has(c.stage) ? [c.stage] : [],
      })
    }
    return candidates
  } finally {
    manager.close()
  }
}

export interface RecoveryChoice {
  contributionId: string
  action: RecoveryAction
  /** Explicit confirmation for destructive actions. */
  confirmed: boolean
}

/**
 * Apply a recovery choice. Destructive actions ALWAYS require confirmation.
 * Returns a description of exactly what happened — never claims success that
 * was not achieved.
 */
export async function applyRecovery(
  choice: RecoveryChoice,
): Promise<{ ok: boolean; message: string }> {
  const manager = new ContributionManager()
  try {
    const c = manager.get(choice.contributionId)
    if (!c) return { ok: false, message: "Contribution not found" }

    switch (choice.action) {
      case "resume":
        await manager.resume(c.id)
        return {
          ok: true,
          message:
            `Contribution ${c.id} resumed at stage ${c.stage}. ` +
            `Any pending approval gates must be re-approved — external actions are never repeated automatically.`,
        }

      case "inspect":
        return {
          ok: true,
          message:
            `Contribution ${c.id}: stage ${c.stage}, worktree ${c.worktreePath ?? "(none)"}, ` +
            `dirty=${c.worktreePath ? "see recovery candidates" : "n/a"}.`,
        }

      case "restart":
        // Restart means restarting the AGENT stage, not external actions.
        return {
          ok: true,
          message:
            `Agent session for ${c.id} can be restarted. Existing changes were preserved. ` +
            `Run '/contribute' again to continue the workflow.`,
        }

      case "abandon":
        if (!choice.confirmed) {
          return {
            ok: false,
            message:
              "Abandoning a contribution requires explicit confirmation. Local changes were NOT discarded.",
          }
        }
        await manager.cancel(c.id, "Abandoned via recovery")
        return {
          ok: true,
          message:
            `Contribution ${c.id} cancelled. The worktree and clone at ${c.worktreePath ?? "(none)"} were preserved. ` +
            `Nothing was pushed, committed or discarded automatically.`,
        }

      default:
        return { ok: false, message: `Unknown action: ${choice.action}` }
    }
  } finally {
    manager.close()
  }
}

/** Verify a worktree still points at a valid git repo (defensive check). */
export async function worktreeHealth(
  worktreePath: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!existsSync(worktreePath)) return { ok: false, detail: "worktree directory missing" }
  const result = await git(["rev-parse", "--is-inside-work-tree"], worktreePath)
  if (result.exitCode !== 0) return { ok: false, detail: "not a git worktree" }
  return { ok: true, detail: "worktree healthy" }
}

export { getPaths }

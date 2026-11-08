/**
 * Contribution lifecycle manager (Phase 7).
 *
 * Owns the state machine. Every transition is persisted to contribution_events
 * before/after. Supports pause, resume, cancel, retry, inspect.
 */

import { randomUUID } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import type { Database } from "../storage/database/client"
import { openDatabase } from "../storage/database/client"
import { contributionEvents, contributions } from "../storage/database/schema"

export type Stage =
  | "DISCOVER"
  | "ISSUE_VALIDATION"
  | "CONTRIBUTION_READINESS"
  | "ISSUE_ANALYSIS"
  | "REPOSITORY_INVESTIGATION"
  | "WORKSPACE_CREATION"
  | "AGENT_INVESTIGATION"
  | "CONTRIBUTION_PLAN"
  | "USER_APPROVAL_PLAN"
  | "IMPLEMENTATION"
  | "TESTING"
  | "INDEPENDENT_VERIFICATION"
  | "CHANGE_REVIEW"
  | "CONTRIBUTION_POLICY_CHECK"
  | "PR_PREPARATION"
  | "USER_APPROVAL_PR"
  | "PR_SUBMISSION"
  | "PR_MONITORING"
  | "MAINTAINER_FEEDBACK"
  | "CANCELLED"
  | "FAILED"

export const STAGE_ORDER: Stage[] = [
  "DISCOVER",
  "ISSUE_VALIDATION",
  "CONTRIBUTION_READINESS",
  "ISSUE_ANALYSIS",
  "REPOSITORY_INVESTIGATION",
  "WORKSPACE_CREATION",
  "AGENT_INVESTIGATION",
  "CONTRIBUTION_PLAN",
  "USER_APPROVAL_PLAN",
  "IMPLEMENTATION",
  "TESTING",
  "INDEPENDENT_VERIFICATION",
  "CHANGE_REVIEW",
  "CONTRIBUTION_POLICY_CHECK",
  "PR_PREPARATION",
  "USER_APPROVAL_PR",
  "PR_SUBMISSION",
  "PR_MONITORING",
  "MAINTAINER_FEEDBACK",
]

export interface ContributionRecord {
  id: string
  repoOwner: string
  repoName: string
  issueNumber: number | null
  issueTitle: string | null
  stage: Stage
  agentId: string | null
  worktreePath: string | null
  branchName: string | null
  prNumber: number | null
  prUrl: string | null
  pausedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ContributionEventRecord {
  id: number
  contributionId: string
  stage: Stage
  actor: string
  type: string
  message: string | null
  payload: unknown
  createdAt: Date
}

export class ContributionManager {
  private db: Database

  constructor(db?: Database) {
    this.db = db ?? openDatabase()
  }

  close(): void {
    this.db.close()
  }

  async create(input: {
    repoOwner: string
    repoName: string
    issueNumber?: number
    issueTitle?: string
    agentId?: string
  }): Promise<ContributionRecord> {
    const id = `contrib-${Date.now()}-${randomUUID().slice(0, 8)}`
    const now = new Date()

    // Wrap in transaction for consistency
    const sqlite = (
      this.db as unknown as { $client: { transaction: (fn: () => void) => () => void } }
    ).$client
    const txn = sqlite.transaction(() => {
      this.db
        .insert(contributions)
        .values({
          id,
          repoOwner: input.repoOwner,
          repoName: input.repoName,
          issueNumber: input.issueNumber ?? null,
          issueTitle: input.issueTitle ?? null,
          stage: "DISCOVER",
          agentId: input.agentId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      this.appendEvent(id, "DISCOVER", "system", "stage.entered", "Contribution created")
    })
    txn()

    const created = this.get(id)
    if (!created) throw new Error("Contribution creation failed")
    return created
  }

  get(id: string): ContributionRecord | null {
    const row = this.db.select().from(contributions).where(eq(contributions.id, id)).get()
    if (!row) return null
    return this.toRecord(row)
  }

  list(): ContributionRecord[] {
    return this.db
      .select()
      .from(contributions)
      .orderBy(desc(contributions.createdAt))
      .all()
      .map((r) => this.toRecord(r))
  }

  listActive(): ContributionRecord[] {
    return this.list().filter(
      (c) => c.stage !== "CANCELLED" && c.stage !== "FAILED" && c.stage !== "MAINTAINER_FEEDBACK",
    )
  }

  async transition(
    id: string,
    toStage: Stage,
    actor: string,
    message?: string,
    payload?: unknown,
  ): Promise<ContributionRecord> {
    const current = this.get(id)
    if (!current) throw new Error(`Contribution not found: ${id}`)
    if (current.stage === "CANCELLED") throw new Error("Cannot transition a cancelled contribution")
    const now = new Date()

    const sqlite = (
      this.db as unknown as { $client: { transaction: (fn: () => void) => () => void } }
    ).$client
    const txn = sqlite.transaction(() => {
      this.db
        .update(contributions)
        .set({ stage: toStage, updatedAt: now, pausedAt: null })
        .where(eq(contributions.id, id))
        .run()
      this.appendEvent(
        id,
        toStage,
        actor,
        "stage.entered",
        message ?? `Moved to ${toStage}`,
        payload,
      )
    })
    txn()

    const updated = this.get(id)
    if (!updated) throw new Error("Contribution transition failed")
    return updated
  }

  async pause(id: string, reason?: string): Promise<ContributionRecord> {
    const now = new Date()
    this.db
      .update(contributions)
      .set({ pausedAt: now, updatedAt: now })
      .where(eq(contributions.id, id))
      .run()
    const current = this.get(id)
    if (!current) throw new Error("Contribution not found")
    this.appendEvent(id, current.stage, "user", "paused", reason ?? "Paused by user")
    const paused = this.get(id)
    if (!paused) throw new Error("Pause failed")
    return paused
  }

  async resume(id: string): Promise<ContributionRecord> {
    const now = new Date()
    this.db
      .update(contributions)
      .set({ pausedAt: null, updatedAt: now })
      .where(eq(contributions.id, id))
      .run()
    const current = this.get(id)
    if (!current) throw new Error("Contribution not found")
    this.appendEvent(id, current.stage, "user", "resumed", "Resumed by user")
    const resumed = this.get(id)
    if (!resumed) throw new Error("Resume failed")
    return resumed
  }

  async cancel(id: string, reason?: string): Promise<ContributionRecord> {
    const now = new Date()
    this.db
      .update(contributions)
      .set({ stage: "CANCELLED", updatedAt: now })
      .where(eq(contributions.id, id))
      .run()
    this.appendEvent(id, "CANCELLED", "user", "cancelled", reason ?? "Cancelled by user")
    const cancelled = this.get(id)
    if (!cancelled) throw new Error("Cancel failed")
    return cancelled
  }

  async setWorktree(id: string, worktreePath: string, branchName: string): Promise<void> {
    this.db
      .update(contributions)
      .set({ worktreePath, branchName, updatedAt: new Date() })
      .where(eq(contributions.id, id))
      .run()
  }

  async setPr(id: string, prNumber: number, prUrl: string): Promise<void> {
    this.db
      .update(contributions)
      .set({ prNumber, prUrl, updatedAt: new Date() })
      .where(eq(contributions.id, id))
      .run()
  }

  events(id: string, limit = 100): ContributionEventRecord[] {
    return this.db
      .select()
      .from(contributionEvents)
      .where(eq(contributionEvents.contributionId, id))
      .orderBy(desc(contributionEvents.id))
      .limit(limit)
      .all()
      .map((r) => ({
        id: r.id,
        contributionId: r.contributionId,
        stage: r.stage as Stage,
        actor: r.actor,
        type: r.type,
        message: r.message,
        payload: r.payload,
        createdAt: new Date(r.createdAt),
      }))
      .reverse()
  }

  appendEvent(
    contributionId: string,
    stage: Stage,
    actor: string,
    type: string,
    message?: string,
    payload?: unknown,
  ): void {
    this.db
      .insert(contributionEvents)
      .values({
        contributionId,
        stage,
        actor,
        type,
        message: message ?? null,
        payload: payload ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }

  private toRecord(row: typeof contributions.$inferSelect): ContributionRecord {
    return {
      id: row.id,
      repoOwner: row.repoOwner,
      repoName: row.repoName,
      issueNumber: row.issueNumber,
      issueTitle: row.issueTitle,
      stage: row.stage as Stage,
      agentId: row.agentId,
      worktreePath: row.worktreePath,
      branchName: row.branchName,
      prNumber: row.prNumber,
      prUrl: row.prUrl,
      pausedAt: row.pausedAt ? new Date(row.pausedAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }
  }
}

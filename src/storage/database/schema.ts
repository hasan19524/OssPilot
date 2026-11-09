/**
 * Drizzle schema — local SQLite state.
 *
 * Persistence rules:
 * - Every contribution transition is appended to contribution_events (never mutated).
 * - Contributions are the aggregate root; all other tables reference them.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
}

export const contributions = sqliteTable(
  "contributions",
  {
    id: text("id").primaryKey(), // ULID-ish: timestamp-prefixed
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    issueNumber: integer("issue_number"),
    issueTitle: text("issue_title"),
    stage: text("stage").notNull().default("DISCOVER"),
    agentId: text("agent_id"),
    worktreePath: text("worktree_path"),
    branchName: text("branch_name"),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    pausedAt: integer("paused_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("idx_contributions_stage").on(t.stage),
    index("idx_contributions_repo").on(t.repoOwner, t.repoName),
  ],
)

export const contributionEvents = sqliteTable(
  "contribution_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    stage: text("stage").notNull(),
    actor: text("actor").notNull(), // "user" | "agent" | "system" | "github"
    type: text("type").notNull(), // stage.entered | stage.exited | approval | error | note | recovery
    message: text("message"),
    payload: text("payload", { mode: "json" }),
    ...timestamps,
  },
  (t) => [index("idx_events_contribution").on(t.contributionId, t.id)],
)

export const agentSessions = sqliteTable(
  "agent_sessions",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    externalSessionId: text("external_session_id"), // OpenCode session id
    status: text("status").notNull().default("pending"), // pending|running|completed|failed|cancelled
    mode: text("mode"), // investigation | implementation | review
    logPath: text("log_path"),
    error: text("error"),
    ...timestamps,
  },
  (t) => [index("idx_agent_sessions_contribution").on(t.contributionId)],
)

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    repoUrl: text("repo_url").notNull(),
    worktreePath: text("worktree_path").notNull(),
    branchName: text("branch_name").notNull(),
    baseBranch: text("base_branch").notNull(),
    status: text("status").notNull().default("active"), // active|dirty|removed
    dirty: integer("dirty", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("uq_workspaces_contribution").on(t.contributionId)],
)

export const testResults = sqliteTable(
  "test_results",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    command: text("command").notNull(),
    exitCode: integer("exit_code").notNull(),
    passed: integer("passed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    output: text("output"),
    ...timestamps,
  },
  (t) => [index("idx_test_results_contribution").on(t.contributionId)],
)

export const reviewReports = sqliteTable(
  "review_reports",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    summary: text("summary"),
    status: text("status").notNull().default("pending"), // pending|ok|needs_attention
    report: text("report", { mode: "json" }),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("idx_review_reports_contribution").on(t.contributionId)],
)

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    contributionId: text("contribution_id")
      .notNull()
      .references(() => contributions.id, { onDelete: "cascade" }),
    number: integer("number"),
    url: text("url"),
    title: text("title").notNull(),
    body: text("body"),
    status: text("status").notNull().default("draft"), // draft|ready|submitted|merged|closed
    ...timestamps,
  },
  (t) => [index("idx_pull_requests_contribution").on(t.contributionId)],
)

/** Generic key-value store for small metadata (schema version, auth cache, AI cache). */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    actor: text("actor"),
    detail: text("detail", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_audit_action").on(t.action, t.id)],
)

export const keyValue = sqliteTable("key_value", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  ...timestamps,
})

export type Contribution = typeof contributions.$inferSelect
export type NewContribution = typeof contributions.$inferInsert
export type ContributionEvent = typeof contributionEvents.$inferSelect
export type NewContributionEvent = typeof contributionEvents.$inferInsert
export type AgentSession = typeof agentSessions.$inferSelect
export type Workspace = typeof workspaces.$inferSelect

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull().default("active"),
    repoOwner: text("repo_owner"),
    repoName: text("repo_name"),
    contributionId: text("contribution_id"),
    externalSessionId: text("external_session_id"),
    providerId: text("provider_id"),
    modelId: text("model_id"),
    workflowState: text("workflow_state"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_sessions_status").on(t.status, t.id)],
)

export const sessionMessages = sqliteTable(
  "session_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | system | tool | approval | error | progress
    content: text("content").notNull(),
    metadata: text("metadata", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_session_messages_session").on(t.sessionId, t.id)],
)

export type Session = typeof sessions.$inferSelect
export type SessionMessage = typeof sessionMessages.$inferSelect

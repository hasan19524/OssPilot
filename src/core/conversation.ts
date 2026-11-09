/**
 * Conversation and session history.
 *
 * A conversation session is NOT a contribution. A session holds the chat
 * transcript and the repository context; a contribution is an execution
 * workflow. They are linked but distinct.
 *
 * Secrets are never persisted here.
 */

import { randomUUID } from "node:crypto"
import { desc, eq } from "drizzle-orm"
import type { Database } from "../storage/database/client"
import { openDatabase } from "../storage/database/client"
import {
  type Session,
  type SessionMessage,
  sessionMessages,
  sessions,
} from "../storage/database/schema"

export type MessageRole =
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "approval"
  | "error"
  | "progress"

export interface Message {
  id: number | null
  sessionId: string
  role: MessageRole
  content: string
  metadata: Record<string, unknown> | null
  createdAt: Date
}

export interface SessionSummary {
  id: string
  title: string
  status: string
  repoOwner: string | null
  repoName: string | null
  contributionId: string | null
  providerId: string | null
  modelId: string | null
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

export class ConversationService {
  private db: Database

  constructor(db?: Database) {
    this.db = db ?? openDatabase()
  }

  close(): void {
    this.db.close()
  }

  createSession(input: {
    title: string
    repoOwner?: string | null
    repoName?: string | null
    providerId?: string | null
    modelId?: string | null
    contributionId?: string | null
  }): SessionSummary {
    const id = `session-${Date.now()}-${randomUUID().slice(0, 6)}`
    const now = new Date()
    this.db
      .insert(sessions)
      .values({
        id,
        title: input.title,
        repoOwner: input.repoOwner ?? null,
        repoName: input.repoName ?? null,
        providerId: input.providerId ?? null,
        modelId: input.modelId ?? null,
        contributionId: input.contributionId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    const created = this.getSession(id)
    if (!created) throw new Error("Session creation failed")
    return created
  }

  getSession(id: string): SessionSummary | null {
    const row = this.db.select().from(sessions).where(eq(sessions.id, id)).get()
    return row ? toSummary(row) : null
  }

  listSessions(options: { includeArchived?: boolean; limit?: number } = {}): SessionSummary[] {
    const rows = this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.updatedAt))
      .limit(options.limit ?? 50)
      .all()
    return rows.filter((r) => (options.includeArchived ? true : !r.archived)).map(toSummary)
  }

  renameSession(id: string, title: string): void {
    this.db.update(sessions).set({ title, updatedAt: new Date() }).where(eq(sessions.id, id)).run()
  }

  archiveSession(id: string): void {
    this.db
      .update(sessions)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run()
  }

  deleteSession(id: string): void {
    this.db.delete(sessions).where(eq(sessions.id, id)).run()
  }

  setSessionContext(
    id: string,
    context: {
      repoOwner?: string | null
      repoName?: string | null
      externalSessionId?: string | null
      providerId?: string | null
      modelId?: string | null
      contributionId?: string | null
      workflowState?: string | null
    },
  ): void {
    this.db
      .update(sessions)
      .set({ ...context, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .run()
  }

  appendMessage(input: {
    sessionId: string
    role: MessageRole
    content: string
    metadata?: Record<string, unknown> | null
  }): Message {
    this.db
      .insert(sessionMessages)
      .values({
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? null,
        createdAt: new Date(),
      })
      .run()
    this.db
      .update(sessions)
      .set({ updatedAt: new Date() })
      .where(eq(sessions.id, input.sessionId))
      .run()
    const rows = this.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, input.sessionId))
      .orderBy(desc(sessionMessages.id))
      .limit(1)
      .all()
    const row = rows[0]
    if (!row) throw new Error("Message was not persisted")
    return toMessage(row)
  }

  listMessages(sessionId: string, limit = 200): Message[] {
    const rows = this.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(sessionMessages.id)
      .limit(limit)
      .all()
    return rows.map(toMessage)
  }
}

function toSummary(row: Session): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    contributionId: row.contributionId,
    providerId: row.providerId,
    modelId: row.modelId,
    archived: row.archived,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

function toMessage(row: SessionMessage): Message {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as MessageRole,
    content: row.content,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    createdAt: new Date(row.createdAt),
  }
}

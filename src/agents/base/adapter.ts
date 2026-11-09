/**
 * Provider-independent coding-agent adapter contract.
 *
 * The ContributionManager and TUI never instantiate an agent directly — they
 * always go through the AgentRegistry. Adding a future provider (Claude Code,
 * Codex, Antigravity, ...) means implementing this interface and registering
 * it. Nothing else changes.
 *
 * v1 ships only the OpenCode adapter. Other adapters are intentionally NOT
 * implemented; the interface is designed so they can be added later.
 */

export type AgentRuntimeState =
  | "NOT_INSTALLED"
  | "NOT_AUTHENTICATED"
  | "STARTING"
  | "CONNECTING"
  | "CONNECTED"
  | "GENERATING"
  | "IDLE"
  | "ERROR"
  | "DISCONNECTED"

export interface AgentStatusReport {
  installed: boolean
  version: string | null
  executablePath: string | null
  state: AgentRuntimeState
  provider: string | null
  model: string | null
  activeSessionId: string | null
  worktreePath: string | null
  lastError: string | null
  limitations: string[]
}

export interface InstallationStatus {
  installed: boolean
  version?: string
  path?: string
  /** Honest list of known limitations for this adapter. */
  limitations: string[]
}

export interface AvailabilityStatus {
  available: boolean
  reason?: string
}

export interface AgentCapabilities {
  streaming: boolean
  structuredOutput: boolean
  permissions: boolean
  steering: boolean
  cancellation: boolean
  sessionRecovery: boolean
  worktreeManagement: boolean
}

export interface SessionConfig {
  worktreePath: string
  model?: string
  title?: string
}

export interface AgentSession {
  id: string
  externalSessionId?: string
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
}

export type AgentEvent =
  | { type: "session.started" }
  | { type: "message.delta"; content: string }
  | { type: "tool.started"; tool: string }
  | { type: "tool.completed"; tool: string }
  | { type: "permission.required"; request: PermissionRequest }
  | { type: "file.changed"; path: string }
  | { type: "command.started"; command: string }
  | { type: "command.completed"; exitCode: number }
  | { type: "session.completed" }
  | { type: "session.failed"; error: string }

export interface PermissionRequest {
  id: string
  title: string
  description?: string
  options: string[]
}

export interface TaskSpec {
  prompt: string
  system?: string
  structuredOutputSchema?: Record<string, unknown>
}

export interface AgentAdapter {
  readonly id: string
  readonly name: string
  readonly displayName: string
  readonly experimental: boolean

  detectInstallation(): Promise<InstallationStatus>
  /** Full runtime status report, including a real readiness check. */
  getStatusReport(options?: { worktreePath?: string }): Promise<AgentStatusReport>
  checkAvailability(): Promise<AvailabilityStatus>
  getCapabilities(): Promise<AgentCapabilities>

  startSession(config: SessionConfig): Promise<AgentSession>
  execute(session: AgentSession, task: TaskSpec): AsyncIterable<AgentEvent>
  cancel(session: AgentSession): Promise<void>
  getStatus(session: AgentSession): Promise<AgentSession["status"]>
}

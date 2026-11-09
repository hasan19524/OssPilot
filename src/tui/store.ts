/**
 * TUI application state (Zustand).
 *
 * Holds conversation messages, the active session, agent runtime status and
 * the interactive approval bridge. No business logic lives here.
 */

import { create } from "zustand"

export type PanelId = "activity" | "terminal" | "diff" | "tests" | "logs" | "changedFiles"
export type FocusArea = "main" | "sidebar" | "composer" | "status"
export type View = "conversation" | "history" | "agents"

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

export interface PendingApproval {
  kind: "approve-plan" | "approve-change" | "approve-commit" | "approve-pr" | "cancel"
  prompt: string
  details: string[]
  options: string[]
  contributionId?: string
}

export interface AgentStatus {
  installed: boolean
  version: string | null
  executablePath: string | null
  state:
    | "NOT_INSTALLED"
    | "NOT_AUTHENTICATED"
    | "STARTING"
    | "CONNECTING"
    | "CONNECTED"
    | "GENERATING"
    | "IDLE"
    | "ERROR"
    | "DISCONNECTED"
  provider: string | null
  model: string | null
  activeSessionId: string | null
  worktreePath: string | null
  lastError: string | null
  limitations: string[]
}

export interface TuiState {
  sidebarVisible: boolean
  view: View
  messages: Message[]
  sessionId: string | null
  busy: boolean
  agentStatus: AgentStatus | null
  pendingApproval: PendingApproval | null
  approvalResolver: ((choice: boolean) => void) | null

  // Context shown in the sidebar
  repoOwner: string
  repoName: string
  branch: string
  contributionStage: string
  issueNumber: number | null
  issueTitle: string
  diffStat: string
  changedFiles: string[]
  composerInput: string

  // Actions
  setView: (view: View) => void
  addMessage: (message: Message) => void
  setMessages: (messages: Message[]) => void
  setSessionId: (id: string | null) => void
  setBusy: (busy: boolean) => void
  setAgentStatus: (status: AgentStatus | null) => void
  requestApproval: (approval: PendingApproval) => Promise<boolean>
  resolveApproval: (choice: "confirm" | "reject") => void
  setContext: (ctx: Partial<TuiState>) => void
  setComposerInput: (value: string) => void
}

export const useTuiStore = create<TuiState>((set) => ({
  sidebarVisible: true,
  view: "conversation",
  messages: [],
  sessionId: null,
  busy: false,
  agentStatus: null,
  pendingApproval: null,
  approvalResolver: null,

  repoOwner: "",
  repoName: "",
  branch: "",
  contributionStage: "DISCOVER",
  issueNumber: null,
  issueTitle: "",
  diffStat: "",
  changedFiles: [],
  composerInput: "",

  setView: (view) => set({ view }),
  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  setMessages: (messages) => set({ messages }),
  setSessionId: (id) => set({ sessionId: id }),
  setBusy: (busy) => set({ busy }),
  setAgentStatus: (status) => set({ agentStatus: status }),
  requestApproval: (approval) =>
    new Promise<boolean>((resolve) => {
      set({ pendingApproval: approval, approvalResolver: resolve })
    }),
  resolveApproval: (choice) =>
    set((s) => {
      const resolver = s.approvalResolver
      if (resolver) resolver(choice === "confirm")
      return {
        pendingApproval: null,
        approvalResolver: null,
        messages: [
          ...s.messages,
          {
            id: null,
            sessionId: s.sessionId ?? "",
            role: choice === "confirm" ? "system" : "error",
            content: choice === "confirm" ? "Approved." : "Rejected.",
            metadata: null,
            createdAt: new Date(),
          },
        ],
      }
    }),
  setContext: (ctx) => set((s) => ({ ...s, ...ctx })),
  setComposerInput: (value) => set({ composerInput: value }),
}))

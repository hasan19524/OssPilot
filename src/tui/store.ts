/**
 * TUI application state (Zustand).
 *
 * All TUI panels read from this store. Business logic never lives here —
 * the store only holds UI-facing state and delegates actions to core services.
 */

import { create } from "zustand"

export type PanelId = "activity" | "terminal" | "diff" | "tests" | "logs" | "changedFiles"
export type FocusArea = "main" | "sidebar" | "composer" | "status"

export interface PendingApproval {
  kind: "approve-plan" | "approve-change" | "approve-commit" | "approve-pr" | "cancel"
  /** Human-readable prompt shown in the approval dialog. */
  prompt: string
  /** Extra context lines shown under the prompt. */
  details: string[]
  /** Options the user can pick; the first is the confirm option. */
  options: string[]
  /** Contribution this approval belongs to. */
  contributionId?: string
}

export interface TuiState {
  // Layout
  sidebarVisible: boolean
  composerVisible: boolean
  activePanel: PanelId
  expandedPanels: Set<PanelId>
  focus: FocusArea

  // Contribution context (displayed in right sidebar)
  currentContributionId: string | null
  repoName: string
  repoOwner: string
  branch: string
  defaultBranch: string
  issueNumber: number | null
  issueTitle: string
  issueLabels: string[]
  difficulty: string
  contributionStage: string
  agentStatus: string
  agentModel: string
  agentSessionStatus: string
  executionMode: string

  // Activity feed
  activityLines: string[]

  // Worktree data
  diffStat: string
  changedFiles: string[]

  // Pending approval (interactive gate)
  pendingApproval: PendingApproval | null
  approvalResolver: ((choice: boolean) => void) | null
  requestApproval: (approval: PendingApproval) => Promise<boolean>
  resolveApproval: (choice: "confirm" | "reject") => void

  // Composer
  composerInput: string

  // Status
  connectionStatus: string
  executionStatus: string

  // Actions
  toggleSidebar: () => void
  togglePanel: (panel: PanelId) => void
  setActivePanel: (panel: PanelId) => void
  setFocus: (area: FocusArea) => void
  setComposerInput: (value: string) => void
  appendActivity: (line: string) => void
  clearActivity: () => void
  setContributionContext: (ctx: Partial<TuiState>) => void
  setDiffData: (data: { diffStat: string; changedFiles: string[] }) => void
}

export const useTuiStore = create<TuiState>((set) => ({
  sidebarVisible: true,
  composerVisible: true,
  activePanel: "activity",
  expandedPanels: new Set<PanelId>(["activity"]),
  focus: "main",

  currentContributionId: null,
  repoName: "",
  repoOwner: "",
  branch: "",
  defaultBranch: "main",
  issueNumber: null,
  issueTitle: "",
  issueLabels: [],
  difficulty: "",
  contributionStage: "DISCOVER",
  agentStatus: "not connected",
  agentModel: "",
  agentSessionStatus: "idle",
  executionMode: "investigation",

  activityLines: [],
  diffStat: "",
  changedFiles: [],
  pendingApproval: null,
  approvalResolver: null,
  composerInput: "",

  connectionStatus: "disconnected",
  executionStatus: "idle",

  toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
  togglePanel: (panel) =>
    set((s) => {
      const next = new Set(s.expandedPanels)
      if (next.has(panel)) next.delete(panel)
      else next.add(panel)
      return { expandedPanels: next }
    }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setFocus: (area) => set({ focus: area }),
  setComposerInput: (value) => set({ composerInput: value }),
  appendActivity: (line) => set((s) => ({ activityLines: [...s.activityLines, line] })),
  clearActivity: () => set({ activityLines: [] }),
  setContributionContext: (ctx) => set((s) => ({ ...s, ...ctx })),
  setDiffData: (data) => set({ diffStat: data.diffStat, changedFiles: data.changedFiles }),
  requestApproval: (approval) =>
    new Promise<boolean>((resolve) => {
      set({ pendingApproval: approval, approvalResolver: resolve, focus: "main" })
    }),
  resolveApproval: (choice) =>
    set((s) => {
      const resolver = s.approvalResolver
      if (resolver) resolver(choice === "confirm")
      return {
        pendingApproval: null,
        approvalResolver: null,
        activityLines: [...s.activityLines, choice === "confirm" ? "[approved]" : "[rejected]"],
      }
    }),
}))

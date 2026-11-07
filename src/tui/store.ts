/**
 * TUI application state (Zustand).
 *
 * All TUI panels read from this store. Business logic never lives here —
 * the store only holds UI-facing state and delegates actions to core services.
 */

import { create } from "zustand"

export type PanelId = "activity" | "terminal" | "diff" | "tests" | "logs" | "changedFiles"
export type FocusArea = "main" | "sidebar" | "composer" | "status"

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
}))

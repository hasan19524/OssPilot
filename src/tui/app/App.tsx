import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useState } from "react"
import { ContributionManager } from "../../core/contributions"
import { dispatch } from "../dispatcher"
import { useTuiStore } from "../store"

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const store = useTuiStore()

  // Poll for contribution state updates (live data from DB).
  useEffect(() => {
    const manager = new ContributionManager()
    const poll = async () => {
      try {
        const active = manager.listActive()
        if (active.length > 0) {
          const c = active[0]
          if (!c) return
          store.setContributionContext({
            currentContributionId: c.id,
            repoOwner: c.repoOwner,
            repoName: c.repoName,
            branch: c.branchName ?? "",
            issueNumber: c.issueNumber,
            issueTitle: c.issueTitle ?? "",
            contributionStage: c.stage,
          })
          const events = manager.events(c.id, 8)
          const newLines = events.map(
            (e) =>
              `[${e.createdAt.toISOString().slice(11, 19)}] ${e.actor}: ${e.message ?? e.type}`,
          )
          if (newLines.length > 0) {
            store.clearActivity()
            for (const line of newLines) store.appendActivity(line)
          }

          // Fetch real worktree data if a worktree exists
          if (c.worktreePath) {
            try {
              const { WorktreeManager } = await import("../../workspace/manager")
              const wm = new WorktreeManager()
              const [diffStat, changedFiles] = await Promise.all([
                wm.diffStat(c.worktreePath),
                wm.changedFiles(c.worktreePath),
              ])
              store.setDiffData({ diffStat, changedFiles })
            } catch {
              // Worktree may not exist yet
            }
          }
        }
      } catch {
        // Ignore polling errors.
      }
    }
    poll()
    const interval = setInterval(poll, 3000)
    return () => {
      clearInterval(interval)
      manager.close()
    }
  }, [store])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      // Safe interrupt — never kills the process abruptly.
      store.appendActivity("[interrupt requested]")
      return
    }
    if (key.ctrl && key.name === "p") {
      store.appendActivity("[command palette] /help lists all commands")
      return
    }
    if (key.ctrl && key.name === "j") {
      store.togglePanel("terminal")
      return
    }
    if (key.ctrl && key.name === "d") {
      store.togglePanel("diff")
      return
    }
    if (key.name === "tab") {
      const areas: Array<"main" | "sidebar" | "composer"> = ["main", "sidebar", "composer"]
      const idx = areas.indexOf(store.focus as "main" | "sidebar" | "composer")
      store.setFocus(areas[(idx + 1) % areas.length] ?? "main")
      return
    }
    if (key.name === "escape") {
      renderer.destroy()
    }
  })

  const sidebarWidth = store.sidebarVisible ? Math.max(28, Math.floor(width * 0.32)) : 0
  const mainWidth = width - sidebarWidth
  const composerHeight = store.composerVisible ? 4 : 1
  const statusHeight = 1
  const panelHeight = height - composerHeight - statusHeight

  return (
    <box style={{ flexDirection: "column", width, height }}>
      <box style={{ flexDirection: "row", height: panelHeight }}>
        <box style={{ flexDirection: "column", width: mainWidth }}>
          <ActivityPanel />
          {store.expandedPanels.has("terminal") && <TerminalPanel />}
          {store.expandedPanels.has("diff") && <DiffPanel />}
          {store.expandedPanels.has("tests") && <TestsPanel />}
          {store.expandedPanels.has("logs") && <LogsPanel />}
          {store.expandedPanels.has("changedFiles") && <ChangedFilesPanel />}
        </box>
        {store.sidebarVisible && <ContextSidebar width={sidebarWidth} />}
      </box>
      {store.composerVisible && <Composer />}
      <StatusBar />
    </box>
  )
}

function ActivityPanel() {
  const lines = useTuiStore((s) => s.activityLines)
  return (
    <box style={{ flexDirection: "column", border: true, flexGrow: 1, padding: 1 }}>
      <text fg="#e5e7eb">ACTIVITY</text>
      <scrollbox style={{ flexGrow: 1 }}>
        {lines.length === 0 ? (
          <text fg="#6b7280">No activity yet. Discover an issue, then start a contribution.</text>
        ) : (
          lines.map((line) => (
            <text key={line} fg="#d1d5db">
              {line}
            </text>
          ))
        )}
      </scrollbox>
    </box>
  )
}

function ContextSidebar({ width }: { width: number }) {
  const s = useTuiStore()
  return (
    <box style={{ flexDirection: "column", width, border: true, padding: 1 }}>
      <text fg="#e5e7eb">REPOSITORY</text>
      <text fg="#9ca3af">{s.repoOwner ? `${s.repoOwner}/${s.repoName}` : "—"}</text>
      <text fg="#9ca3af">branch: {s.branch || "—"}</text>
      <text fg="#9ca3af">default: {s.defaultBranch}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        ISSUE
      </text>
      <text fg="#9ca3af">
        {s.issueNumber ? `#${s.issueNumber}` : "—"} {s.issueTitle}
      </text>
      <text fg="#9ca3af">labels: {s.issueLabels.join(", ") || "—"}</text>
      <text fg="#9ca3af">difficulty: {s.difficulty || "—"}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        AGENT
      </text>
      <text fg="#9ca3af">status: {s.agentStatus}</text>
      <text fg="#9ca3af">model: {s.agentModel || "—"}</text>
      <text fg="#9ca3af">session: {s.agentSessionStatus}</text>
      <text fg="#9ca3af">mode: {s.executionMode}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        WORKFLOW
      </text>
      <text fg="#9ca3af">stage: {s.contributionStage}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        CONTEXT
      </text>
      <text fg="#9ca3af">contribution: {s.currentContributionId ?? "—"}</text>
    </box>
  )
}

function TerminalPanel() {
  return (
    <box style={{ flexDirection: "column", border: true, height: 8, padding: 1 }}>
      <text fg="#e5e7eb">TERMINAL (Ctrl+J to toggle)</text>
      <text fg="#9ca3af">[terminal output appears here]</text>
    </box>
  )
}

function DiffPanel() {
  const diffStat = useTuiStore((s) => s.diffStat)
  return (
    <box style={{ flexDirection: "column", border: true, height: 10, padding: 1 }}>
      <text fg="#e5e7eb">GIT DIFF (Ctrl+D to toggle)</text>
      {diffStat ? <text fg="#9ca3af">{diffStat}</text> : <text fg="#4b5563">No changes yet</text>}
    </box>
  )
}

function TestsPanel() {
  return (
    <box style={{ flexDirection: "column", border: true, height: 8, padding: 1 }}>
      <text fg="#e5e7eb">TEST RESULTS</text>
      <text fg="#9ca3af">[test output appears here]</text>
    </box>
  )
}

function LogsPanel() {
  return (
    <box style={{ flexDirection: "column", border: true, height: 8, padding: 1 }}>
      <text fg="#e5e7eb">EXECUTION LOGS</text>
      <text fg="#9ca3af">[logs appear here]</text>
    </box>
  )
}

function ChangedFilesPanel() {
  const changedFiles = useTuiStore((s) => s.changedFiles)
  return (
    <box style={{ flexDirection: "column", border: true, height: 8, padding: 1 }}>
      <text fg="#e5e7eb">CHANGED FILES ({changedFiles.length})</text>
      {changedFiles.length > 0 ? (
        changedFiles.map((f) => (
          <text key={f} fg="#d1d5db">
            {f}
          </text>
        ))
      ) : (
        <text fg="#4b5563">No changed files</text>
      )}
    </box>
  )
}

function Composer() {
  const input = useTuiStore((s) => s.composerInput)
  const setInput = useTuiStore((s) => s.setComposerInput)
  const appendActivity = useTuiStore((s) => s.appendActivity)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const text = input.trim()
    if (!text || busy) return
    appendActivity(`› ${text}`)
    setInput("")
    setBusy(true)
    try {
      const result = await dispatch(text, (line) => appendActivity(line))
      for (const line of result.output) appendActivity(line)
    } catch (error) {
      appendActivity(`Error: ${String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <box style={{ flexDirection: "row", border: true, height: 3, padding: 1 }}>
      <text fg="#9ca3af">{busy ? "… " : "› "}</text>
      <input
        value={input}
        onInput={setInput}
        onSubmit={submit}
        placeholder="Ask OSSPilot, or /help for commands"
        style={{ flexGrow: 1 }}
      />
    </box>
  )
}

function StatusBar() {
  const s = useTuiStore()
  return (
    <box style={{ flexDirection: "row", height: 1, paddingX: 1 }}>
      <text fg="#6b7280">
        {s.currentContributionId ?? "no contribution"} · {s.agentStatus} · {s.contributionStage} ·{" "}
        {s.connectionStatus}
      </text>
    </box>
  )
}

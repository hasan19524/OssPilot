import { existsSync } from "node:fs"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useRef, useState } from "react"
import { ensureAgent, getAgent } from "../../agents/registry"
import { ContributionManager } from "../../core/contributions"
import { ConversationService, type SessionSummary } from "../../core/conversation"
import { formatError } from "../../core/errors"
import { detectLocalRepository } from "../../workspace/local-repository"
import { type DispatchContext, dispatch } from "../dispatcher"
import { type Message, type TuiState, useTuiStore } from "../store"

/** Run a DB operation with a ConversationService that is always closed afterwards. */
function withConversation<T>(fn: (conv: ConversationService) => T): T {
  const conv = new ConversationService()
  try {
    return fn(conv)
  } finally {
    conv.close()
  }
}

/** Small helper to render a message with a stable key. */
function msgKey(m: {
  id: number | null
  sessionId: string
  role: string
  content: string
  createdAt: Date
}): string {
  return `${m.id ?? "t"}-${m.role}-${m.createdAt.getTime()}-${m.content.slice(0, 16)}`
}

/**
 * Read the sidebar context the dispatcher needs. Read from the store at call
 * time so a long-running handler never sees a stale repository selection.
 */
function currentDispatchContext(bridge: DispatchContext["bridge"]): DispatchContext {
  const s = useTuiStore.getState()
  return {
    selectedRef: s.repoOwner ? { owner: s.repoOwner, repo: s.repoName } : null,
    selectedIssue: s.issueNumber,
    cwd: process.cwd(),
    bridge,
    setContext: (update) => useTuiStore.getState().setContext(update),
  }
}

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const store = useTuiStore()

  // --- Boot: restore a session, load agent status, hydrate the sidebar ---
  useEffect(() => {
    ensureAgent()
    const st = useTuiStore.getState()
    try {
      const messages = withConversation((conv) => {
        const existing = conv.listSessions({ limit: 1 })[0]
        const session =
          existing ??
          conv.createSession({
            title: "New conversation",
            providerId: st.agentStatus?.provider ?? null,
            modelId: st.agentStatus?.model ?? null,
          })
        st.setSessionId(session.id)
        const loaded = conv.listMessages(session.id)
        if (!existing) {
          conv.appendMessage({
            sessionId: session.id,
            role: "assistant",
            content:
              "Welcome to OSSPilot. Ask me to find an issue, research a repository, plan a contribution, " +
              "or explain a codebase. Type /help for commands.",
          })
          return conv.listMessages(session.id)
        }
        return loaded
      })
      st.setMessages(messages)

      // Sidebar: real state, never placeholders.
      hydrateContext(st)
    } catch (error) {
      st.addMessage({
        id: null,
        sessionId: st.sessionId ?? "",
        role: "system",
        content: `Startup warning: ${formatError(error)}`,
        metadata: null,
        createdAt: new Date(),
      })
    }

    const a = getAgent("opencode")
    if (a) {
      void a
        .getStatusReport()
        .then((report) => st.setAgentStatus(report as never))
        .catch((error: unknown) => {
          st.addMessage({
            id: null,
            sessionId: st.sessionId ?? "",
            role: "error",
            content: `Agent status unavailable: ${formatError(error)}`,
            metadata: null,
            createdAt: new Date(),
          })
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Terminal quit / interrupt ---
  useKeyboard((key) => {
    // Approval gate overrides everything else.
    if (store.pendingApproval) {
      if (key.name === "y") {
        store.resolveApproval("confirm")
        return
      }
      if (key.name === "n") {
        store.resolveApproval("reject")
        return
      }
      return
    }

    if (key.ctrl && key.name === "c") {
      if (store.busy && !store.cancelRequested) {
        store.requestCancel()
        store.addMessage({
          id: null,
          sessionId: store.sessionId ?? "",
          role: "system",
          content: "Cancel requested — the running operation stops at its next safe point.",
          metadata: null,
          createdAt: new Date(),
        })
      } else if (!store.busy) {
        // Idle Ctrl+C quits; a busy Ctrl+C cancels instead (handled above).
        renderer.destroy()
      }
      return
    }

    if (key.ctrl && key.name === "p") {
      store.setView("agents")
      return
    }

    if (key.name === "escape") {
      if (store.view === "conversation") {
        renderer.destroy()
      } else {
        store.setView("conversation")
      }
      return
    }

    if (store.view !== "conversation" && key.name === "return") {
      store.setView("conversation")
    }
  })

  const mainHeight = height - 1 // status bar

  return (
    <box style={{ flexDirection: "column", width, height }}>
      <box style={{ flexDirection: "row", height: mainHeight }}>
        <box style={{ flexDirection: "column", flexGrow: 1 }}>
          {store.view === "conversation" && <ConversationView store={store} />}
          {store.view === "agents" && <AgentsView store={store} />}
          {store.view === "history" && <HistoryView />}
        </box>
        {store.sidebarVisible && (
          <SidebarView store={store} width={Math.max(24, Math.floor(width * 0.3))} />
        )}
      </box>
      <StatusBar store={store} />
      <ApprovalDialog store={store} />
    </box>
  )
}

/**
 * Populate the sidebar from state that actually exists: a *currently running*
 * contribution if there is one (worktree on disk AND recent activity — a dead
 * record from a previous run must not be presented as current work),
 * otherwise the repository open in this terminal.
 */
function hydrateContext(st: ReturnType<typeof useTuiStore.getState>): void {
  try {
    const manager = new ContributionManager()
    try {
      const recencyMs = 30 * 60 * 1000
      for (const candidate of manager.listActive()) {
        if (!candidate.worktreePath || !existsSync(candidate.worktreePath)) continue
        const last = manager.events(candidate.id, 1)[0]
        if (!last || Date.now() - last.createdAt.getTime() > recencyMs) continue
        st.setContext({
          repoOwner: candidate.repoOwner,
          repoName: candidate.repoName,
          branch: candidate.branchName ?? "",
          issueNumber: candidate.issueNumber ?? null,
          issueTitle: candidate.issueTitle ?? "",
          contributionStage: candidate.stage,
        })
        return
      }
    } finally {
      manager.close()
    }
  } catch {
    // The sidebar must never block startup — fall through to the local repo.
  }

  const local = detectLocalRepository(process.cwd())
  void local.then((ref) => {
    if (ref && !useTuiStore.getState().repoOwner) {
      useTuiStore.getState().setContext({
        repoOwner: ref.owner,
        repoName: ref.repo,
        contributionStage: "DISCOVER",
      })
    }
  })
}

function ConversationView({ store }: { store: TuiState }) {
  const messages: Message[] = store.messages
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  // Follow new output: the newest reply must be visible without manual
  // scrolling, even when a long restored history precedes it.
  const followKey = `${messages.length}:${messages[messages.length - 1]?.content.length ?? 0}`
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows message count, last message growth and busy transitions
  useEffect(() => {
    const box = scrollRef.current
    if (!box) return
    box.scrollTo(Number.POSITIVE_INFINITY)
  }, [followKey, store.busy])
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <scrollbox ref={scrollRef} style={{ flexGrow: 1 }} stickyScroll stickyStart="bottom">
        {messages.length === 0 && (
          <box style={{ flexDirection: "column" }}>
            <text fg="#e5e7eb">OSSPilot</text>
            <text fg="#9ca3af">Open-source contribution agent, running in your terminal.</text>
            <text fg="#6b7280">Type /help, or ask in natural language.</text>
          </box>
        )}
        {messages.map((m) => (
          <box key={msgKey(m)} style={{ flexDirection: "column", marginBottom: 1 }}>
            <text fg={roleColor(m.role)}>
              {m.role === "user"
                ? "you"
                : m.role === "assistant"
                  ? "osspilot"
                  : m.role.toUpperCase()}
            </text>
            {m.content.split("\n").map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: line order is the identity here
              <text key={`${m.content.length}-${i}`} fg="#d1d5db">
                {line.length > 0 ? line : " "}
              </text>
            ))}
          </box>
        ))}
        {store.busy && (
          <text fg="#22d3ee">
            {store.cancelRequested ? "* cancelling at the next safe point..." : "* working..."}
          </text>
        )}
      </scrollbox>
      <Composer store={store} />
    </box>
  )
}
function AgentsView({ store }: { store: TuiState }) {
  const s = store.agentStatus
  // biome-ignore lint/correctness/useExhaustiveDependencies: load status on mount only
  useEffect(() => {
    const a = getAgent("opencode")
    if (!a) return
    let cancelled = false
    void a
      .getStatusReport()
      .then((report) => {
        if (!cancelled) store.setAgentStatus(report)
      })
      .catch(() => {
        /* the sidebar still shows the last known state */
      })
    return () => {
      cancelled = true
    }
  }, [])
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <text fg="#e5e7eb">AGENT</text>
      {s ? (
        <>
          <text fg="#9ca3af">OpenCode {s.version ?? ""}</text>
          <text fg={agentStateColor(s.state)}>state: {s.state}</text>
          <text fg="#9ca3af">executable: {s.executablePath ?? "-"}</text>
          <text fg="#9ca3af">provider: {s.provider ?? "none detected"}</text>
          <text fg="#9ca3af">model: {s.model ?? "not set"}</text>
          <text fg="#9caef">session: {s.activeSessionId ?? "-"}</text>
          {s.lastError && <text fg="#f87171">last error: {s.lastError}</text>}
          {s.limitations.map((l: string) => (
            <text key={l} fg="#fbbf24">
              ! {l}
            </text>
          ))}
        </>
      ) : (
        <text fg="#9ca3af">checking...</text>
      )}
      <text fg="#6b7280">Esc to return. Ctrl+P for this view.</text>
    </box>
  )
}

function HistoryView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setSessions(withConversation((conv) => conv.listSessions({ limit: 50 })))
    } catch (e) {
      setError(formatError(e))
    }
  }, [])

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <text fg="#e5e7eb">CONVERSATION HISTORY</text>
      {error && <text fg="#f87171">{error}</text>}
      {!error && sessions.length === 0 && (
        <text fg="#9ca3af">No conversations yet — send a message to start one.</text>
      )}
      <scrollbox style={{ flexGrow: 1 }}>
        {sessions.map((s) => (
          <box key={s.id} style={{ flexDirection: "column", marginBottom: 1 }}>
            <text fg="#d1d5db">{s.title}</text>
            <text fg="#9ca3af">
              {s.id} - {s.repoOwner ? `${s.repoOwner}/${s.repoName}` : "no repository"} -{" "}
              {s.updatedAt.toLocaleString()}
            </text>
          </box>
        ))}
      </scrollbox>
      <text fg="#6b7280">Esc to return. /resume &lt;session-id&gt; to reopen one.</text>
    </box>
  )
}

function SidebarView({ store, width }: { store: TuiState; width: number }) {
  const s = store.agentStatus
  const agentState = s ? s.state : "CHECKING"
  const repoText = store.repoOwner ? `${store.repoOwner}/${store.repoName}` : "none selected"
  const issueText = store.issueNumber
    ? `#${store.issueNumber}`
    : store.repoOwner
      ? "none selected"
      : "none selected"

  return (
    <box style={{ flexDirection: "column", width, border: true, padding: 1 }}>
      <text fg="#e5e7eb">REPOSITORY</text>
      <text fg={store.repoOwner ? "#9ca3af" : "#6b7280"}>{repoText}</text>
      <text fg="#6b7280">branch: {store.branch || "—"}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        ISSUE
      </text>
      <text fg={store.issueNumber ? "#9ca3af" : "#6b7280"}>{issueText}</text>
      {store.issueTitle && <text fg="#6b7280">{store.issueTitle}</text>}

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        AGENT
      </text>
      <text fg={agentStateColor(agentState)}>{agentState}</text>
      <text fg="#6b7280">{s?.model ?? s?.provider ?? "no model reported"}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        WORKFLOW
      </text>
      <text fg="#9ca3af">stage: {store.contributionStage}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        CHANGES
      </text>
      <text fg={store.changedFiles.length > 0 ? "#9ca3af" : "#6b7280"}>
        {store.changedFiles.length} file(s)
      </text>
      {store.changedFiles.map((f) => (
        <text key={f} fg="#d1d5db">
          {f}
        </text>
      ))}
    </box>
  )
}

function Composer({ store }: { store: TuiState }) {
  const input = store.composerInput
  const setInput = store.setComposerInput

  const submit = async () => {
    const text = input.trim()
    if (!text || store.busy) return

    const st = useTuiStore.getState()
    const userMessage: Message = {
      id: null,
      sessionId: st.sessionId ?? "",
      role: "user",
      content: text,
      metadata: null,
      createdAt: new Date(),
    }
    st.addMessage(userMessage)
    setInput("")
    st.setBusy(true)
    st.clearCancel()

    const say = (role: "assistant" | "system" | "error" | "tool" | "progress", content: string) => {
      const msg: Message = {
        id: null,
        sessionId: useTuiStore.getState().sessionId ?? "",
        role,
        content,
        metadata: null,
        createdAt: new Date(),
      }
      useTuiStore.getState().addMessage(msg)
      return msg
    }

    // Persist a turn so history survives a restart. Storage failures must not
    // take the session down, so they degrade to an unpersisted local message.
    const persist = (role: "user" | "assistant" | "system", content: string): Message | null => {
      const sessionId = useTuiStore.getState().sessionId
      if (!sessionId || content.length === 0) return null
      try {
        return withConversation((conv) => conv.appendMessage({ sessionId, role, content }))
      } catch {
        return null
      }
    }

    const persistedUser = persist("user", text)
    // The optimistic message stays for instant feedback; `persistedUser` only
    // guarantees the turn is in the database for the next launch.
    void persistedUser

    try {
      const bridge: DispatchContext["bridge"] = {
        requestApproval: (approval) => useTuiStore.getState().requestApproval(approval),
        appendActivity: (line) => {
          const stage = line.match(/^\[([A-Z_]+)\]/)
          if (stage?.[1]) {
            useTuiStore.getState().setContext({ contributionStage: stage[1] })
          }
          say("progress", line)
        },
      }

      const result = await dispatch(
        text,
        (line) => {
          if (useTuiStore.getState().cancelRequested) {
            throw new Error("Cancelled by user at a safe point.")
          }
          say("progress", line)
        },
        { context: currentDispatchContext(bridge) },
      )

      if (result.context) useTuiStore.getState().setContext(result.context)
      if (result.messages) useTuiStore.getState().setMessages(result.messages)
      if (result.view) useTuiStore.getState().setView(result.view)

      if (result.output.length > 0) {
        const joined = result.output.join("\n")
        persist("assistant", joined)
        say("assistant", joined)
      }
    } catch (error) {
      const cancelled = /Cancelled by user/.test(String(error))
      say(cancelled ? "system" : "error", cancelled ? "Cancelled." : formatError(error))
    } finally {
      useTuiStore.getState().setBusy(false)
      useTuiStore.getState().clearCancel()
    }
  }

  return (
    <box style={{ flexDirection: "row", border: true, height: 3, padding: 1 }}>
      <text fg="#9ca3af">{store.busy ? "* " : "> "}</text>
      <input
        value={input}
        onInput={setInput}
        onSubmit={submit}
        // The composer must accept typing without requiring a mouse click,
        // and must release the keyboard to the approval gate while it is open.
        focused={!store.pendingApproval}
        placeholder="Ask OSSPilot, or /help"
        style={{ flexGrow: 1 }}
      />
    </box>
  )
}

function StatusBar({ store }: { store: TuiState }) {
  const s = store.agentStatus
  return (
    <box style={{ flexDirection: "row", height: 1, paddingX: 1 }}>
      <text fg="#6b7280">
        {store.sessionId ?? "no session"} - {s?.state ?? "CHECKING"} {s?.model ?? ""} -{" "}
        {store.contributionStage}
        {store.busy ? " - working" : ""}
      </text>
    </box>
  )
}

function ApprovalDialog({ store }: { store: TuiState }) {
  const approval = store.pendingApproval
  if (!approval) return null
  const confirm = approval.options[0] ?? "Confirm"
  const reject = approval.options[1] ?? "Reject"
  return (
    <box style={{ position: "absolute", left: 2, right: 2, top: 2, border: true, padding: 1 }}>
      <text fg="#e5e7eb">APPROVAL REQUIRED</text>
      <text fg="#d1d5db">{approval.prompt}</text>
      {approval.details.map((d) => (
        <text key={d} fg="#9ca3af">
          {d}
        </text>
      ))}
      <text fg="#6b7280">
        Press y to {confirm}, n to {reject}. Nothing happens until you choose.
      </text>
    </box>
  )
}

function agentStateColor(state: string): string {
  switch (state) {
    case "CONNECTED":
    case "IDLE":
      return "#34d399"
    case "GENERATING":
    case "STARTING":
    case "CONNECTING":
      return "#22d3ee"
    case "NOT_INSTALLED":
    case "NOT_AUTHENTICATED":
    case "DISCONNECTED":
    case "ERROR":
      return "#f87171"
    default:
      return "#9ca3af"
  }
}

function roleColor(role: string): string {
  switch (role) {
    case "user":
      return "#22d3ee"
    case "assistant":
      return "#e5e7eb"
    case "error":
      return "#f87171"
    case "approval":
      return "#fbbf24"
    case "progress":
      return "#6b7280"
    default:
      return "#9ca3af"
  }
}

// Referenced by the boot effect to keep the agent registry seeded.
void getAgent
void ensureAgent

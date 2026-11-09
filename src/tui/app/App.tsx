import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useEffect, useState } from "react"
import { ensureAgent, getAgent } from "../../agents/registry"
import type { SessionSummary } from "../../core/conversation"
import { ConversationService } from "../../core/conversation"
import { dispatch } from "../dispatcher"
import { type Message, type TuiState, useTuiStore } from "../store"

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

export function App() {
  const renderer = useRenderer()
  const { width, height } = useTerminalDimensions()
  const store = useTuiStore()

  // --- Boot: create or restore a session, then load agent status ---
  useEffect(() => {
    ensureAgent()
    const st = useTuiStore.getState()
    const conv = new ConversationService()
    try {
      const existing = conv.listSessions({ limit: 1 })[0]
      const session =
        existing ??
        conv.createSession({
          title: "New conversation",
          providerId: st.agentStatus?.provider ?? null,
          modelId: st.agentStatus?.model ?? null,
        })
      st.setSessionId(session.id)
      const msgs = conv.listMessages(session.id)
      if (!existing) {
        conv.appendMessage({
          sessionId: session.id,
          role: "assistant",
          content:
            "Welcome to OSSPilot. Ask me to find an issue, research a repository, plan a contribution, " +
            "or explain a codebase. Type /help for commands.",
        })
        st.setMessages(conv.listMessages(session.id))
      } else {
        st.setMessages(msgs)
      }

      const a = getAgent("opencode")
      if (a) {
        void a.getStatusReport().then((report) => st.setAgentStatus(report as never))
      }
    } catch (error) {
      st.addMessage({
        id: null,
        sessionId: st.sessionId ?? "",
        role: "system",
        content: `Startup warning: ${String(error)}`,
        metadata: null,
        createdAt: new Date(),
      })
    } finally {
      conv.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // --- Terminal quit ---
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
      store.addMessage({
        id: null,
        sessionId: store.sessionId ?? "",
        role: "system",
        content: "Interrupt requested. Any running operation will stop at the next safe point.",
        metadata: null,
        createdAt: new Date(),
      })
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

    if (store.view === "history") {
      if (key.name === "return") {
        store.setView("conversation")
      }
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

function ConversationView({ store }: { store: TuiState }) {
  const messages: Message[] = store.messages
  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <scrollbox style={{ flexGrow: 1 }}>
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
            <text fg="#d1d5db">{m.content}</text>
          </box>
        ))}
        {store.busy && <text fg="#22d3ee">* working...</text>}
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
    void a.getStatusReport().then((report) => {
      if (!cancelled) store.setAgentStatus(report)
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
          <text fg="#9ca3af">state: {s.state}</text>
          <text fg="#9ca3af">executable: {s.executablePath ?? "-"}</text>
          <text fg="#9ca3af">provider: {s.provider ?? "-"}</text>
          <text fg="#9ca3af">model: {s.model ?? "-"}</text>
          <text fg="#9caef">session: {s.activeSessionId ?? "-"}</text>
          {s.lastError && <text fg="#f87171">last error: {s.lastError}</text>}
          {s.limitations.map((l: string) => (
            <text key={l} fg="#7f1d1d">
              limitation: {l}
            </text>
          ))}
        </>
      ) : (
        <text fg="#9ca3af">status unknown</text>
      )}
      <text fg="#6b7280">Esc to return. Ctrl+P for this view.</text>
    </box>
  )
}

function HistoryView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    const conv = new ConversationService()
    try {
      setSessions(conv.listSessions({ limit: 50 }))
    } finally {
      conv.close()
    }
  }, [])

  return (
    <box style={{ flexDirection: "column", flexGrow: 1, padding: 1 }}>
      <text fg="#e5e7eb">CONVERSATION HISTORY</text>
      <scrollbox style={{ flexGrow: 1 }}>
        {sessions.map((s) => (
          <box key={s.id} style={{ flexDirection: "column", marginBottom: 1 }}>
            <text fg="#d1d5db">{s.title}</text>
            <text fg="#9ca3af">
              {s.repoOwner ? `${s.repoOwner}/${s.repoName}` : "no repository"} -{" "}
              {s.updatedAt.toLocaleString()}
            </text>
          </box>
        ))}
      </scrollbox>
      <text fg="#6b7280">
        Esc to return. Use the CLI (osspilot resume) to resume contributions.
      </text>
    </box>
  )
}

function SidebarView({ store, width }: { store: TuiState; width: number }) {
  return (
    <box style={{ flexDirection: "column", width, border: true, padding: 1 }}>
      <text fg="#e5e7eb">REPOSITORY</text>
      <text fg="#9ca3af">{store.repoOwner ? `${store.repoOwner}/${store.repoName}` : "-"}</text>
      <text fg="#9ca3af">branch: {store.branch || "-"}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        ISSUE
      </text>
      <text fg="#9ca3af">{store.issueNumber ? `#${store.issueNumber}` : "-"}</text>
      <text fg="#9ca3af">{store.issueTitle}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        AGENT
      </text>
      <text fg="#9ca3af">{store.agentStatus?.state ?? "unknown"}</text>
      <text fg="#9ca3af">{store.agentStatus?.model ?? ""}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        WORKFLOW
      </text>
      <text fg="#9ca3af">stage: {store.contributionStage}</text>

      <text fg="#e5e7eb" style={{ marginTop: 1 }}>
        CHANGES
      </text>
      <text fg="#9ca3af">{store.changedFiles.length} file(s)</text>
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

    store.addMessage({
      id: null,
      sessionId: store.sessionId ?? "",
      role: "user",
      content: text,
      metadata: null,
      createdAt: new Date(),
    })
    setInput("")
    store.setBusy(true)

    const say = (role: "assistant" | "system" | "error" | "tool" | "progress", content: string) => {
      const msg = {
        id: null,
        sessionId: store.sessionId ?? "",
        role,
        content,
        metadata: null,
        createdAt: new Date(),
      }
      store.addMessage(msg)
      return msg
    }

    try {
      // Session management commands handled locally.
      if (text === "/history" || text === "/sessions") {
        const conv = new ConversationService()
        try {
          const list = conv.listSessions({ limit: 50 })
          store.setView("history")
          if (list.length === 0) say("system", "No conversations yet.")
        } finally {
          conv.close()
        }
        return
      }

      if (text === "/new") {
        const conv = new ConversationService()
        try {
          const s = conv.createSession({ title: "New conversation" })
          store.setSessionId(s.id)
          store.setMessages([])
          say("system", `Started conversation ${s.id}.`)
        } finally {
          conv.close()
        }
        return
      }

      if (text.startsWith("/resume")) {
        const id = text.replace(/^\/resume\s*/, "").trim()
        if (!id) {
          say("error", "Usage: /resume <session-id>")
          return
        }
        const conv = new ConversationService()
        try {
          const s = conv.getSession(id)
          if (!s) {
            say("error", `No session named ${id}.`)
            return
          }
          store.setSessionId(id)
          store.setMessages(conv.listMessages(id))
          say("system", `Resumed conversation ${id}: ${s.title}`)
        } finally {
          conv.close()
        }
        return
      }

      const result = await dispatch(text, (line) => say("progress", line))
      for (const line of result.output) say("assistant", line)
      // Persist the assistant turn.
      if (result.output.length > 0 && store.sessionId) {
        const conv = new ConversationService()
        try {
          conv.appendMessage({
            sessionId: store.sessionId,
            role: "assistant",
            content: result.output.join("\n"),
          })
        } finally {
          conv.close()
        }
      }
    } catch (error) {
      say("error", String(error))
    } finally {
      store.setBusy(false)
    }
  }

  return (
    <box style={{ flexDirection: "row", border: true, height: 3, padding: 1 }}>
      <text fg="#9ca3af">{store.busy ? "* " : "> "}</text>
      <input
        value={input}
        onInput={setInput}
        onSubmit={submit}
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
        {store.sessionId ?? "no session"} - {s?.state ?? "unknown"} {s?.model ?? ""} -{" "}
        {store.contributionStage}
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

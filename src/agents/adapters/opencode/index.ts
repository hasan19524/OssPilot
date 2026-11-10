/**
 * OpenCode adapter (Phase 6).
 */

import { type ChildProcess, spawn } from "node:child_process"
import { OSSPilotError } from "../../../core/errors"
import { resolveCommand } from "../../../core/exec"
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentSession,
  AgentStatusReport,
  AvailabilityStatus,
  InstallationStatus,
  SessionConfig,
  TaskSpec,
} from "../../base/adapter"
import { extractAffectedPath } from "./path-extract"

/**
 * Permission ruleset applied to every OSSPilot-opened session.
 *
 * File edits inside the isolated worktree are permitted by design (the user
 * approved the plan and the worktree is disposable). Network fetches are
 * denied, and shell execution stays at "ask" so the reply policy decides.
 */
const SESSION_PERMISSIONS = [
  { action: "edit", resource: "*", effect: "allow" },
  { action: "write", resource: "*", effect: "allow" },
  { action: "patch", resource: "*", effect: "allow" },
  { action: "read", resource: "*", effect: "allow" },
  { action: "webfetch", resource: "*", effect: "deny" },
]

/**
 * Tools whose permission requests are auto-approved once.
 * These are local file operations inside the isolated worktree.
 */
const FILE_EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit", "createfile", "applypatch"])

interface RunningServer {
  process: ChildProcess
  baseUrl: string
  password: string
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly id = "opencode"
  readonly name = "OpenCode"
  readonly displayName = "OpenCode"
  readonly experimental = false

  private servers = new Map<string, RunningServer>()
  private activeSessionIds = new Map<string, string>()
  private providerId: string | null = null
  private modelId: string | null = null

  async detectInstallation(): Promise<InstallationStatus> {
    const limitations: string[] = []
    try {
      const { stdout } = await runCommand("opencode", ["--version"])
      const version = stdout.trim().split(/\r?\n/)[0]
      const path = await which("opencode")
      return { installed: true, version, path: path ?? undefined, limitations }
    } catch (error) {
      return {
        installed: false,
        limitations: [`OpenCode not found on PATH: ${String(error)}`],
      }
    }
  }

  async checkAvailability(): Promise<AvailabilityStatus> {
    const install = await this.detectInstallation()
    if (!install.installed) {
      return { available: false, reason: "OpenCode is not installed" }
    }
    return { available: true }
  }

  /**
   * Read the provider configuration WITHOUT printing any secret.
   *
   * Only the *names* of stored credentials and a configured model id are read;
   * token material is never returned, logged or displayed. When the files are
   * absent the result says so instead of guessing.
   */
  private async detectProviderState(): Promise<{
    provider: string | null
    model: string | null
    authenticated: boolean
  }> {
    const { detectProviderState } = await import("./provider-config")
    const state = detectProviderState()
    return {
      provider: state.providers.length > 0 ? state.providers.join(", ") : null,
      model: state.model,
      authenticated: state.authenticated,
    }
  }

  async getStatusReport(options: { worktreePath?: string } = {}): Promise<AgentStatusReport> {
    const install = await this.detectInstallation()
    if (!install.installed) {
      return {
        installed: false,
        version: install.version ?? null,
        executablePath: install.path ?? null,
        state: "NOT_INSTALLED",
        provider: null,
        model: null,
        activeSessionId: null,
        worktreePath: options.worktreePath ?? null,
        lastError: null,
        limitations: install.limitations,
      }
    }

    const providerState = await this.detectProviderState()
    const provider = this.providerId ?? providerState.provider
    const model = this.modelId ?? providerState.model
    const authLimitation = providerState.authenticated
      ? []
      : [
          "OpenCode has no authenticated provider — run `opencode auth login` before starting a contribution.",
        ]

    if (options.worktreePath) {
      const existing = this.servers.get(options.worktreePath)
      if (!existing) {
        return {
          installed: true,
          version: install.version ?? null,
          executablePath: install.path ?? null,
          state: providerState.authenticated ? "IDLE" : "NOT_AUTHENTICATED",
          provider,
          model,
          activeSessionId: null,
          worktreePath: options.worktreePath,
          lastError: null,
          limitations: [...install.limitations, ...authLimitation],
        }
      }
      const reachable = await this.pingServer(existing)
      return {
        installed: true,
        version: install.version ?? null,
        executablePath: install.path ?? null,
        state: reachable ? "CONNECTED" : "DISCONNECTED",
        provider,
        model,
        activeSessionId: this.activeSessionIds.get(options.worktreePath) ?? null,
        worktreePath: options.worktreePath,
        lastError: reachable ? null : "Server process is alive but not responding",
        limitations: [...install.limitations, ...authLimitation],
      }
    }

    // No worktree requested: report a live session if one exists instead of
    // claiming IDLE while the agent is actually working.
    const activeSessions = Array.from(this.activeSessionIds.entries())
    const firstActive = activeSessions[0]
    return {
      installed: true,
      version: install.version ?? null,
      executablePath: install.path ?? null,
      state: providerState.authenticated
        ? firstActive
          ? "CONNECTED"
          : "IDLE"
        : "NOT_AUTHENTICATED",
      provider,
      model,
      activeSessionId: firstActive?.[1] ?? null,
      worktreePath: firstActive?.[0] ?? null,
      lastError: null,
      limitations: [...install.limitations, ...authLimitation],
    }
  }

  private async pingServer(server: RunningServer): Promise<boolean> {
    try {
      const res = await fetch(`${server.baseUrl}/info`, { method: "GET" })
      return res.ok
    } catch {
      return false
    }
  }

  async getCapabilities(): Promise<AgentCapabilities> {
    return {
      streaming: false,
      structuredOutput: true,
      permissions: true,
      steering: true,
      cancellation: true,
      sessionRecovery: true,
      worktreeManagement: true,
    }
  }

  private authHeaders(server: RunningServer): Record<string, string> {
    return { Authorization: `Basic ${btoa(`opencode:${server.password}`)}` }
  }

  async startSession(config: SessionConfig): Promise<AgentSession> {
    const server = await this.ensureServer(config.worktreePath)
    const headers = { ...this.authHeaders(server), "Content-Type": "application/json" }
    const res = await fetch(`${server.baseUrl}/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: config.title ?? "OSSPilot contribution",
        permissions: SESSION_PERMISSIONS,
      }),
    })
    if (!res.ok) {
      throw new OSSPilotError(
        "AGENT_SESSION_ERROR",
        `session create failed: ${res.status} ${await res.text()}`,
      )
    }
    const json = (await res.json()) as { data?: { id?: string }; id?: string }
    const externalId = json?.data?.id ?? json?.id
    if (!externalId) {
      throw new OSSPilotError(
        "AGENT_SESSION_ERROR",
        `OpenCode did not return a session id: ${JSON.stringify(json).slice(0, 300)}`,
      )
    }
    return {
      id: `oc-${Date.now()}`,
      externalSessionId: externalId,
      status: "pending",
    }
  }

  async *execute(session: AgentSession, task: TaskSpec): AsyncIterable<AgentEvent> {
    if (!session.externalSessionId) {
      throw new OSSPilotError("AGENT_SESSION_ERROR", "Session has no external id")
    }

    const server = Array.from(this.servers.values()).pop()
    if (!server) throw new OSSPilotError("AGENT_SESSION_ERROR", "No running OpenCode server")

    const headers = { ...this.authHeaders(server), "Content-Type": "application/json" }
    const sid = session.externalSessionId

    // Track the session against the worktree key it belongs to.
    let worktreeKey: string | undefined
    for (const [key, value] of this.servers) {
      if (value === server) worktreeKey = key
    }
    if (worktreeKey) this.activeSessionIds.set(worktreeKey, sid)

    yield { type: "session.started" }

    // Live permission handling: a headless server auto-rejects unresolved
    // requests. File edits inside the isolated worktree are approved once;
    // anything else is rejected and surfaced through the event stream.
    let stopPermissions = false
    const permissionLoop = (async () => {
      while (!stopPermissions) {
        await sleep(1200)
        if (stopPermissions) return
        try {
          const res = await fetch(`${server.baseUrl}/permission/request`, {
            headers: this.authHeaders(server),
          })
          if (!res.ok) continue
          const body = (await res.json()) as { data?: Array<Record<string, unknown>> }
          const requests = Array.isArray(body?.data) ? body.data : []
          for (const request of requests) {
            const id = String(request.id ?? request.requestID ?? "")
            if (!id) continue
            const tool = String(request.tool ?? request.action ?? "").toLowerCase()
            const decision = FILE_EDIT_TOOLS.has(tool) || tool === "" ? "once" : "reject"
            await fetch(`${server.baseUrl}/session/${sid}/permission/${id}/reply`, {
              method: "POST",
              headers,
              body: JSON.stringify({ decision }),
            })
          }
        } catch {
          // Permission endpoint may be location-scoped; ignore and retry.
        }
      }
    })()

    try {
      const promptRes = await fetch(`${server.baseUrl}/session/${sid}/prompt`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: task.prompt }),
      })
      if (!promptRes.ok) {
        yield {
          type: "session.failed",
          error: `prompt failed: ${promptRes.status} ${await promptRes.text()}`,
        }
        return
      }

      const deadline = Date.now() + 300000
      let lastText = ""
      let stablePolls = 0
      const seenMessageIds = new Set<string>()
      const seenToolIds = new Set<string>()

      while (Date.now() < deadline) {
        await sleep(2000)
        const msgRes = await fetch(`${server.baseUrl}/session/${sid}/message`, {
          headers: this.authHeaders(server),
        })
        if (!msgRes.ok) continue
        const json = (await msgRes.json()) as { data?: Array<Record<string, unknown>> }
        const messages = Array.isArray(json?.data) ? json.data : []

        for (const raw of messages) {
          const messageId = String(raw.id ?? "")
          if (messageId && seenMessageIds.has(messageId)) continue
          if (messageId) seenMessageIds.add(messageId)

          const type = String(raw.type ?? "")
          if (type !== "assistant") continue

          const content = Array.isArray(raw.content) ? raw.content : []
          for (const part of content) {
            if (!part || typeof part !== "object") continue
            const record = part as Record<string, unknown>
            const partType = String(record.type ?? "")

            // Internal chain-of-thought is never surfaced.
            if (partType === "reasoning") continue

            if (partType === "tool") {
              const toolId = String(record.id ?? `${messageId}-${seenToolIds.size}`)
              if (seenToolIds.has(toolId)) continue
              seenToolIds.add(toolId)
              const toolName = String(record.name ?? "tool")
              if (process.env.OSSPILOT_DEBUG_AGENT) {
                process.stderr.write(
                  `[oc] ALL tool states: ${JSON.stringify(content).slice(0, 800)}\n`,
                )
              }
              yield { type: "tool.started", tool: toolName }
              const state = record.state as Record<string, unknown> | undefined
              const filePath = extractAffectedPath(state)
              if (filePath) yield { type: "file.changed", path: filePath }
            }
            // Text parts are aggregated from the full message list below.
          }

          const structured = (raw as { info?: { structured?: unknown } }).info?.structured
          if (structured) {
            yield {
              type: "message.delta",
              content: `\n\n[structured] ${JSON.stringify(structured)}`,
            }
          }
        }

        // Aggregate the full assistant text so partial first sightings cannot
        // truncate the final answer, then emit only the new delta.
        const fullText = messages
          .filter((m) => String(m.type ?? "") === "assistant")
          .map((m) => buildAssistantText(Array.isArray(m.content) ? m.content : []))
          .filter((t) => t.length > 0)
          .join("\n")
        if (fullText && fullText !== lastText) {
          const delta = fullText.startsWith(lastText) ? fullText.slice(lastText.length) : fullText
          if (delta) yield { type: "message.delta", content: delta }
          lastText = fullText
          stablePolls = 0
        } else if (fullText) {
          stablePolls++
        }

        // A tool that is still executing keeps the turn open even when the
        // text has been quiet for a few polls.
        let anyToolRunning = false
        for (const raw of messages) {
          if (String(raw.type ?? "") !== "assistant") continue
          const parts = Array.isArray(raw.content) ? raw.content : []
          for (const part of parts) {
            if (!part || typeof part !== "object") continue
            const record = part as Record<string, unknown>
            if (String(record.type ?? "") !== "tool") continue
            const state = record.state as Record<string, unknown> | undefined
            const status = String(state?.status ?? state?.state ?? "").toLowerCase()
            if (["pending", "running", "in_progress", "started"].includes(status)) {
              anyToolRunning = true
            }
          }
        }

        // Stable answer, nothing running => the turn is finished. This covers
        // BOTH plain answers (no tools at all) and post-tool summaries; the
        // hard deadline above remains the safety net for a stalled turn.
        if (lastText && stablePolls >= 2 && !anyToolRunning) {
          yield { type: "session.completed" }
          return
        }
      }

      yield { type: "session.completed" }
    } finally {
      stopPermissions = true
      await permissionLoop.catch(() => undefined)
    }
  }
  async cancel(session: AgentSession): Promise<void> {
    if (!session.externalSessionId) return
    const server = Array.from(this.servers.values()).pop()
    if (!server) return
    await fetch(`${server.baseUrl}/session/${session.externalSessionId}/interrupt`, {
      method: "POST",
      headers: this.authHeaders(server),
    }).catch(() => undefined)
  }

  async getStatus(session: AgentSession): Promise<AgentSession["status"]> {
    return session.status
  }

  /** Kill all spawned OpenCode server processes. Called on shutdown. */
  shutdown(): void {
    for (const [, server] of this.servers) {
      try {
        server.process.kill("SIGTERM")
      } catch {
        // Process may already be dead
      }
    }
    this.servers.clear()
  }

  private async ensureServer(worktreePath: string): Promise<RunningServer> {
    const existing = this.servers.get(worktreePath)
    if (existing) return existing

    const port = await findFreePort()
    const opencodeBin = await resolveCommand("opencode")
    const child = spawn(opencodeBin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: worktreePath,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let password = ""
    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString()
      const match = text.match(/server password\s+(\S+)/)
      if (match?.[1]) {
        password = match[1]
        // Stop capturing stdout after password extraction to avoid leaking it
        child.stdout?.removeAllListeners("data")
        child.stdout?.destroy()
      }
    })

    const baseUrl = `http://127.0.0.1:${port}/api`
    const deadline = Date.now() + 20000
    while (Date.now() < deadline && !password) {
      await sleep(250)
    }
    if (!password) {
      throw new OSSPilotError("AGENT_SESSION_ERROR", "OpenCode server did not report a password")
    }
    await sleep(500)

    const server: RunningServer = { process: child, baseUrl, password }
    this.servers.set(worktreePath, server)
    return server
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import("node:child_process")
  const { promisify } = await import("node:util")
  const exec = promisify(execFile)
  const resolved = await resolveCommand(command)
  const { stdout, stderr } = await exec(resolved, args, { timeout: 10000, windowsHide: true })
  return { stdout: stdout ?? "", stderr: stderr ?? "" }
}

async function which(command: string): Promise<string | null> {
  return resolveCommand(command)
}

async function findFreePort(): Promise<number> {
  const { createServer } = await import("node:net")
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
    srv.on("error", reject)
  })
}

function buildAssistantText(content: unknown[]): string {
  return content
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .filter((p) => String(p.type ?? "") === "text" && typeof p.text === "string")
    .map((p) => String(p.text))
    .join("")
}

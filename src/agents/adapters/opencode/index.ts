/**
 * OpenCode adapter (Phase 6).
 *
 * Spawns a dedicated `opencode serve` instance per worktree (project-scoped),
 * then drives it through @opencode-ai/sdk. Never touches the user's own
 * OpenCode TUI/background service.
 *
 * Only this file knows about OpenCode specifics. The rest of OSSPilot talks to
 * the AgentAdapter interface.
 */

import { type ChildProcess, spawn } from "node:child_process"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { OSSPilotError } from "../../../core/errors"
import type {
  AgentAdapter,
  AgentCapabilities,
  AgentEvent,
  AgentSession,
  AvailabilityStatus,
  InstallationStatus,
  PermissionRequest,
  SessionConfig,
  TaskSpec,
} from "../../base/adapter"

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

  async detectInstallation(): Promise<InstallationStatus> {
    const limitations: string[] = []
    try {
      const { stdout } = await runCommand("opencode", ["--version"])
      const version = stdout.trim().split(/\r?\n/)[0]
      // Find binary path
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

  async getCapabilities(): Promise<AgentCapabilities> {
    return {
      streaming: true,
      structuredOutput: true,
      permissions: true,
      steering: true,
      cancellation: true,
      sessionRecovery: true,
      worktreeManagement: true,
    }
  }

  async startSession(config: SessionConfig): Promise<AgentSession> {
    const server = await this.ensureServer(config.worktreePath)
    // Auth header for basic auth
    const authClient = createOpencodeClient({
      baseUrl: server.baseUrl,
      // The SDK uses fetch; inject Authorization via a custom fetch.
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Basic ${btoa(`opencode:${server.password}`)}`)
        return fetch(input, { ...init, headers })
      },
    })
    const session = await authClient.session.create(
      { title: config.title ?? "OSSPilot contribution" },
      { throwOnError: true },
    )
    const externalId =
      (session as { data?: { id?: string } })?.data?.id ?? (session as { id?: string })?.id
    if (!externalId) {
      throw new OSSPilotError("AGENT_SESSION_ERROR", "OpenCode did not return a session id")
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
    // Find the server for this session (we keyed by worktree; reuse the last).
    const server = Array.from(this.servers.values()).pop()
    if (!server) throw new OSSPilotError("AGENT_SESSION_ERROR", "No running OpenCode server")

    const client = createOpencodeClient({
      baseUrl: server.baseUrl,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Basic ${btoa(`opencode:${server.password}`)}`)
        return fetch(input, { ...init, headers })
      },
    })

    yield { type: "session.started" }

    // Send the prompt asynchronously.
    await client.session.promptAsync(
      {
        sessionID: session.externalSessionId,
        parts: [{ type: "text", text: task.prompt }],
        ...(task.structuredOutputSchema
          ? { format: { type: "json_schema", schema: task.structuredOutputSchema } }
          : {}),
      },
      { throwOnError: true },
    )

    // Stream events filtered to this session until idle.
    const events = await client.event.subscribe()
    for await (const event of events.stream) {
      const e = event as { type?: string; properties?: Record<string, unknown> }
      const type = e.type ?? ""
      const props = e.properties ?? {}
      const sessionId = (props.sessionID ?? props.sessionId) as string | undefined
      if (sessionId && sessionId !== session.externalSessionId) continue

      if (type === "session.text.delta") {
        const content = (props.delta ?? props.text ?? "") as string
        if (content) yield { type: "message.delta", content }
      } else if (type === "session.tool.called" || type === "session.tool.started") {
        const tool = (props.tool ?? props.name ?? "tool") as string
        yield { type: "tool.started", tool }
      } else if (type === "session.tool.success" || type === "session.tool.completed") {
        const tool = (props.tool ?? props.name ?? "tool") as string
        yield { type: "tool.completed", tool }
        const filePath = (props.path ?? props.file) as string | undefined
        if (filePath) yield { type: "file.changed", path: filePath }
      } else if (type === "permission.asked") {
        const req: PermissionRequest = {
          id: String(props.id ?? props.requestID ?? ""),
          title: String(props.title ?? "Permission required"),
          description: props.description as string | undefined,
          options: Array.isArray(props.options) ? (props.options as string[]) : ["allow", "deny"],
        }
        yield { type: "permission.required", request: req }
      } else if (type === "session.execution.failed") {
        yield { type: "session.failed", error: String(props.error ?? "execution failed") }
        return
      } else if (type === "session.idle" || type === "session.execution.succeeded") {
        yield { type: "session.completed" }
        return
      }
    }
  }

  async cancel(session: AgentSession): Promise<void> {
    if (!session.externalSessionId) return
    const server = Array.from(this.servers.values()).pop()
    if (!server) return
    const client = createOpencodeClient({
      baseUrl: server.baseUrl,
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Basic ${btoa(`opencode:${server.password}`)}`)
        return fetch(input, { ...init, headers })
      },
    })
    await client.session.abort({ sessionID: session.externalSessionId }).catch(() => undefined)
  }

  async getStatus(session: AgentSession): Promise<AgentSession["status"]> {
    return session.status
  }

  private async ensureServer(worktreePath: string): Promise<RunningServer> {
    const existing = this.servers.get(worktreePath)
    if (existing) return existing

    const password = randomPassword()
    const port = await findFreePort()
    const child = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: worktreePath,
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_SERVER_USERNAME: "opencode",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    const baseUrl = `http://127.0.0.1:${port}`
    // Wait for health.
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${baseUrl}/global/health`, {
          headers: { Authorization: `Basic ${btoa(`opencode:${password}`)}` },
        })
        if (res.ok) break
      } catch {
        // not ready
      }
      await sleep(250)
    }

    const server: RunningServer = { process: child, baseUrl, password }
    this.servers.set(worktreePath, server)
    return server
  }
}

// --- helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

async function runCommand(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  const { execFile } = await import("node:child_process")
  const { promisify } = await import("node:util")
  const exec = promisify(execFile)
  const { stdout, stderr } = await exec(command, args, { timeout: 10000, windowsHide: true })
  return { stdout: stdout ?? "", stderr: stderr ?? "" }
}

async function which(command: string): Promise<string | null> {
  try {
    const { execFile } = await import("node:child_process")
    const { promisify } = await import("node:util")
    const exec = promisify(execFile)
    const cmd = process.platform === "win32" ? "where" : "which"
    const { stdout } = await exec(cmd, [command], { timeout: 5000, windowsHide: true })
    return stdout.trim().split(/\r?\n/)[0] ?? null
  } catch {
    return null
  }
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

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
  AvailabilityStatus,
  InstallationStatus,
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
      body: JSON.stringify({ title: config.title ?? "OSSPilot contribution" }),
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

    yield { type: "session.started" }

    // Send the prompt.
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

    // Poll for the assistant response.
    const deadline = Date.now() + 300000
    let lastText = ""
    while (Date.now() < deadline) {
      await sleep(2000)
      const msgRes = await fetch(`${server.baseUrl}/session/${sid}/message`, {
        headers: this.authHeaders(server),
      })
      if (!msgRes.ok) continue
      const json = (await msgRes.json()) as { data?: unknown }
      const messages = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []
      // Find assistant messages.
      const assistantMsgs = messages.filter(
        (m: { type?: string }) => m.type === "assistant" || m.type === "assistant",
      )
      if (assistantMsgs.length === 0) continue
      // Get the last assistant message's text.
      const last = assistantMsgs[assistantMsgs.length - 1] as {
        parts?: Array<{ type?: string; text?: string }>
        info?: { structured?: unknown }
      }
      const textParts = (last.parts ?? []).filter(
        (p) => p.type === "text" && typeof p.text === "string",
      )
      const fullText = textParts.map((p) => p.text as string).join("")
      if (fullText && fullText !== lastText) {
        // Yield only the new portion.
        const newText = fullText.slice(lastText.length)
        if (newText) yield { type: "message.delta", content: newText }
        lastText = fullText
      }
      // Check if session is idle (no more processing). We'll check message count stability.
      // Simple heuristic: if we got a full response and 2s passed, consider done.
      // Better: check session status endpoint.
      // Termination: if we have a stable full response, finish.
      if (fullText && fullText === lastText) {
        await sleep(2000)
        const recheck = await fetch(`${server.baseUrl}/session/${sid}/message`, {
          headers: this.authHeaders(server),
        })
        if (recheck.ok) {
          const rjson = (await recheck.json()) as { data?: unknown }
          const rmsgs = Array.isArray(rjson?.data) ? rjson.data : []
          const rassistants = rmsgs.filter((m: { type?: string }) => m.type === "assistant")
          const rlast = rassistants[rassistants.length - 1] as
            | { parts?: Array<{ type?: string; text?: string }> }
            | undefined
          const rtext = (rlast?.parts ?? [])
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? "")
            .join("")
          if (rtext === fullText || rtext === "") {
            yield { type: "session.completed" }
            return
          }
          lastText = rtext
          if (rtext && rtext !== fullText) {
            const newText = rtext.slice(fullText.length)
            if (newText) yield { type: "message.delta", content: newText }
          }
        }
      }
    }

    yield { type: "session.completed" }
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

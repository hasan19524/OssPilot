/**
 * Optional research capability detection.
 *
 * OSSPilot's core GitHub intelligence works without any of these. This module
 * only *detects* what is available so the first-run setup can report it.
 *
 * Detection is read-only: it runs `<cmd> --version` and never installs
 * anything. Installation always requires explicit user action.
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolveCommand } from "./exec"

const execFileAsync = promisify(execFile)

export type ResearchCapabilityId = "agent-browser" | "websearch"

export interface ResearchCapability {
  id: ResearchCapabilityId
  name: string
  description: string
  installed: boolean
  version: string | null
  /** Install command the user can run themselves. */
  installHint: string
}

async function detect(command: string): Promise<string | null> {
  try {
    const resolved = await resolveCommand(command)
    const { stdout } = await execFileAsync(resolved, ["--version"], {
      timeout: 8000,
      windowsHide: true,
    })
    return stdout.trim().split(/\r?\n/)[0] ?? null
  } catch {
    return null
  }
}

export async function detectResearchCapabilities(): Promise<ResearchCapability[]> {
  const browserVersion = await detect("agent-browser")

  return [
    {
      id: "agent-browser",
      name: "agent-browser",
      description:
        "Optional browser automation CLI. Lets OSSPilot read project websites, " +
        "documentation and release notes when the GitHub API is not enough. " +
        "Never required for GitHub discovery, issue research or contribution planning.",
      installed: browserVersion !== null,
      version: browserVersion,
      installHint: "npm i -g agent-browser && agent-browser install",
    },
    {
      id: "websearch",
      name: "Web search",
      description:
        "Configured search providers used for general research. Optional; all " +
        "GitHub facts are verified from the GitHub API.",
      installed: Boolean(process.env.OSSPILOT_WEBSEARCH_PROVIDER),
      version: null,
      installHint: "Set OSSPILOT_WEBSEARCH_PROVIDER and OSSPILOT_WEBSEARCH_API_KEY",
    },
  ]
}

/** CLI rendering helper — kept separate from the detection logic. */
export async function summarizeResearchCapabilities(): Promise<string> {
  const caps = await detectResearchCapabilities()
  const lines = ["Optional web research capabilities:"]
  for (const cap of caps) {
    if (cap.installed) {
      lines.push(`  [installed] ${cap.name} ${cap.version ?? ""}`)
    } else {
      lines.push(`  [not installed] ${cap.name}`)
      lines.push(`      ${cap.description}`)
      lines.push(`      Install yourself with: ${cap.installHint}`)
    }
  }
  lines.push("")
  lines.push("None of these are required. GitHub intelligence works without them.")
  return lines.join("\n")
}

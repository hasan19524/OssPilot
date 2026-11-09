import type { Command } from "commander"
import { ensurePaths, getPaths } from "../../config/paths"
import { loadUserConfig } from "../../config/settings"
import { resolveCommand } from "../../core/exec"
import { detectResearchCapabilities } from "../../core/research-capabilities"
import { createCredentialStore } from "../../security/credentials"

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("First-run setup: check GitHub, AI provider, OpenCode and research options")
    .option("--json", "output machine-readable JSON")
    .action(async (options: { json?: boolean }) => {
      ensurePaths()
      const paths = getPaths()
      const _config = loadUserConfig(paths)
      const store = createCredentialStore()

      const githubToken = await store.get("github_token")
      const bharatcodeKey = await store.get("bharatcode_api_key")

      let gitOk = false
      let opencodeOk = false
      const _opencodeVersion: string | null = null
      try {
        const gitBin = await resolveCommand("git")
        gitOk = Boolean(gitBin)
      } catch {
        gitOk = false
      }
      try {
        const bin = await resolveCommand("opencode")
        if (bin) opencodeOk = true
      } catch {
        opencodeOk = false
      }

      const research = await detectResearchCapabilities()

      const report = {
        required: {
          git: { ok: gitOk, note: gitOk ? "detected" : "install from https://git-scm.com" },
          opencode: {
            ok: opencodeOk,
            note: opencodeOk
              ? "detected"
              : "required for code implementation; research/discovery still work without it",
          },
        },
        optional: {
          github: { ok: Boolean(githubToken), note: "OS keyring or OSSPILOT_GITHUB_TOKEN" },
          bharatcode: { ok: Boolean(bharatcodeKey), note: "OSSPILOT_BHARATCODE_API_KEY" },
          alternativeProviders: {
            ok: false,
            note: "OSSPILOT_OPENAI_API_KEY, OSSPILOT_ANTHROPIC_API_KEY, OSSPILOT_GOOGLE_API_KEY, OSSPILOT_NVIDIA_API_KEY, OSSPILOT_OPENROUTER_API_KEY, Ollama",
          },
          research: research.map((c) => ({ id: c.id, installed: c.installed, version: c.version })),
        },
        paths: paths,
      }

      if (options.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        return
      }

      process.stdout.write("\nWELCOME TO OSSPILOT\n\n")
      process.stdout.write("Let's prepare your environment.\n\n")

      process.stdout.write("[1] REQUIRED — Git\n")
      process.stdout.write(
        `    ${gitOk ? "OK  git detected" : "MISSING  install from https://git-scm.com"}\n\n`,
      )

      process.stdout.write("[2] REQUIRED — OpenCode coding runtime\n")
      if (opencodeOk) {
        process.stdout.write("    OK  opencode detected\n")
        process.stdout.write(
          "    Without OpenCode, research/discovery/planning still work; code does not run.\n\n",
        )
      } else {
        process.stdout.write("    MISSING  required for implementation\n")
        process.stdout.write(
          "    Install from https://opencode.ai, then re-run 'osspilot setup'.\n\n",
        )
      }

      process.stdout.write("[3] OPTIONAL — GitHub connection\n")
      process.stdout.write(
        githubToken
          ? "    OK  token configured\n"
          : "    not set  run 'osspilot config auth github'\n\n",
      )

      process.stdout.write("[4] OPTIONAL — AI intelligence provider\n")
      process.stdout.write(
        bharatcodeKey
          ? "    OK  BharatCode configured\n"
          : "    not set  run 'osspilot config auth bharatcode'\n",
      )
      process.stdout.write(
        "    Alternatives: OpenAI, Anthropic, Google AI Studio, NVIDIA, OpenRouter, Ollama\n\n",
      )

      process.stdout.write("[5] OPTIONAL — Web research integrations\n")
      for (const cap of research) {
        process.stdout.write(
          cap.installed
            ? `    installed  ${cap.name} ${cap.version ?? ""}\n`
            : `    not installed  ${cap.name} (${cap.installHint})\n`,
        )
      }
      process.stdout.write("    None of these are required for GitHub operations.\n\n")

      process.stdout.write(`Data directory: ${paths.root}\n`)
      process.stdout.write("Next step: 'osspilot discover --language typescript'\n\n")
    })
}

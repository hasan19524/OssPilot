import type { Command } from "commander"
import { ensurePaths } from "../../config/paths"
import { defaultUserConfig, loadUserConfig, saveUserConfig } from "../../config/settings"
import { pollForToken, requestDeviceCode } from "../../integrations/github/device-flow"
import { createCredentialStore } from "../../security/credentials"

const GITHUB_CLIENT_ID = process.env.OSSPILOT_GITHUB_CLIENT_ID ?? "Ov23li8t0P1p2v5k3q7r" // placeholder; users should set their own

export function registerConfigCommand(program: Command): void {
  const config = program.command("config").description("Show or edit user configuration")

  config
    .command("show")
    .description("Print current config (default)")
    .action(async () => {
      const paths = ensurePaths()
      const cfg = loadUserConfig(paths)
      process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`)
    })

  config
    .command("path")
    .description("Print config file path")
    .action(async () => {
      const paths = ensurePaths()
      process.stdout.write(`${paths.configFile}\n`)
    })

  config
    .command("reset")
    .description("Reset config to defaults")
    .action(async () => {
      const paths = ensurePaths()
      saveUserConfig(paths, defaultUserConfig())
      process.stdout.write(`Config reset to defaults at ${paths.configFile}\n`)
    })

  config
    .command("auth")
    .description("Authenticate (github | bharatcode)")
    .argument("<provider>", "github or bharatcode")
    .action(async (provider: string) => {
      const store = createCredentialStore()
      if (provider === "github") {
        const clientId = process.env.OSSPILOT_GITHUB_CLIENT_ID ?? GITHUB_CLIENT_ID
        process.stdout.write("Starting GitHub device flow...\n")
        const code = await requestDeviceCode(clientId)
        process.stdout.write(
          `\nOpen ${code.verificationUri} in your browser and enter code: ${code.userCode}\n\n`,
        )
        process.stdout.write("Waiting for authorization...\n")
        const token = await pollForToken(clientId, code.deviceCode, code.interval, code.expiresIn)
        await store.set("github_token", token.accessToken)
        process.stdout.write("GitHub authentication successful. Token stored in OS keyring.\n")
      } else if (provider === "bharatcode") {
        process.stdout.write("Enter your BharatCode API key: ")
        const { createInterface } = await import("node:readline")
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const key = await new Promise<string>((resolve) => {
          rl.question("", (answer) => {
            rl.close()
            resolve(answer.trim())
          })
        })
        if (!key) {
          process.stderr.write("No key provided.\n")
          process.exitCode = 1
          return
        }
        await store.set("bharatcode_api_key", key)
        process.stdout.write("BharatCode API key stored in OS keyring.\n")
      } else {
        process.stderr.write(`Unknown provider: ${provider}. Use "github" or "bharatcode".\n`)
        process.exitCode = 1
      }
    })

  // Default: show config
  config.action(async () => {
    const paths = ensurePaths()
    const cfg = loadUserConfig(paths)
    process.stdout.write(`${JSON.stringify(cfg, null, 2)}\n`)
  })
}

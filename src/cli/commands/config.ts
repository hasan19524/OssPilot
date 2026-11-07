import type { Command } from "commander"
import { ensurePaths } from "../../config/paths"
import { defaultUserConfig, loadUserConfig, saveUserConfig } from "../../config/settings"

export function registerConfigCommand(program: Command): void {
  program
    .command("config")
    .description("Show or edit user configuration (~/.osspilot/config/config.json)")
    .option("--path", "print config file path")
    .option("--reset", "reset config to defaults")
    .option("--show", "print current config (default)")
    .action(async (options: { path?: boolean; reset?: boolean; show?: boolean }) => {
      const paths = ensurePaths()
      if (options.path) {
        process.stdout.write(`${paths.configFile}\n`)
        return
      }
      if (options.reset) {
        saveUserConfig(paths, defaultUserConfig())
        process.stdout.write(`Config reset to defaults at ${paths.configFile}\n`)
        return
      }
      const config = loadUserConfig(paths)
      process.stdout.write(`${JSON.stringify(config, null, 2)}\n`)
    })
}

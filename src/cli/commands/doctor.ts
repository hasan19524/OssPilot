import type { Command } from "commander"
import { type CheckStatus, runDoctorChecks } from "../../core/doctor"

const STATUS_ICONS: Record<CheckStatus, string> = {
  ok: "✓",
  warn: "!",
  fail: "✗",
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check local environment health (runtime, database, git, agents, credentials)")
    .option("--json", "output machine-readable JSON")
    .action(async (options: { json?: boolean }) => {
      const checks = await runDoctorChecks()
      if (options.json) {
        process.stdout.write(`${JSON.stringify(checks, null, 2)}\n`)
      } else {
        process.stdout.write("OSSPilot environment\n\n")
        for (const check of checks) {
          const icon = STATUS_ICONS[check.status]
          process.stdout.write(`  ${icon} ${check.name.padEnd(16)} ${check.detail}\n`)
          if (check.hint) {
            process.stdout.write(`      ${check.hint}\n`)
          }
        }
        const failures = checks.filter((c) => c.status === "fail").length
        const warnings = checks.filter((c) => c.status === "warn").length
        process.stdout.write(`\n${failures} failure(s), ${warnings} warning(s)\n`)
      }
      if (checks.some((c) => c.status === "fail")) process.exitCode = 1
    })
}

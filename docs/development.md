# Development

## Layout

| Path | Contents |
|---|---|
| `src/cli/` | commander-based CLI commands |
| `src/tui/` | OpenTUI + React interface (`app/`, `intent.ts`, `dispatcher.ts`) |
| `src/core/` | orchestration: contribution runner, conversation, planner, verification |
| `src/integrations/github/` | Octokit client, repositories, issues, intelligence, pre-flight |
| `src/agents/` | coding-agent adapters (OpenCode) and registry |
| `src/workspace/` | worktree manager, local repository detection |
| `src/storage/` | drizzle schema, migrations, repositories |
| `src/security/` | credentials, policy, path safety |
| `docs/`, `tests/`, `scripts/` | documentation, vitest suites, tooling |

## Gates

```bash
bun run typecheck     # tsc --noEmit
bun run lint          # biome check src tests
bun run test          # vitest run (197 tests)
bun run test:coverage
bun run build         # dist/osspilot(.exe)
bun run doctor        # environment health
```

All five gates run in CI (`.github/workflows/ci.yml`).

## Driving the TUI without a desktop

`scripts/_tui_console.ps1` starts the real binary in its own hidden console,
injects key events into that console's input buffer and reads the screen back
out. It touches no windows, no focus and no foreground application, so it is
safe to run while anything else is on screen:

```powershell
# compiled binary
powershell -File scripts\_tui_console.ps1 -Name demo -Steps '4000,hi{ENTER}' -Seconds 8

# same scenario against the Bun runtime
powershell -File scripts\_tui_console.ps1 -Name demo_bun `
  -Exe "C:\Users\<you>\AppData\Roaming\npm\node_modules\bun\bin\bun.exe" `
  -ExtraArgs "run src/index.ts" -Steps '4000,hi{ENTER}' -Seconds 8
```

`scripts/_vt_replay.ts` replays raw terminal (VT) output into a readable screen
for runs started with redirected stdin/stdout.

## Migrations

SQLite migrations are generated with drizzle-kit and bundled at build time:

```bash
bun run db:generate
bun run build   # prebuild runs scripts/generate-migrations.py
```

## Video assets

`scripts/build_product_video_frames.py` (Pillow) and
`scripts/build_intro_audio.py` (numpy) generate frames and soundtrack for the
typographic product videos; `ffmpeg` assembles them. The media files themselves
are not committed (see `.gitignore`).

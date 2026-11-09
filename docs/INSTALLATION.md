# Installation

## System requirements

| Requirement | Detail |
|---|---|
| OS | Windows 11 (verified), Linux x64 and macOS (builds produced by CI; runtime tested on Windows only) |
| Disk | ~200 MB for the binary and local repositories |
| Git | Required for every contribution operation |
| OpenCode | Required for code implementation |

No Bun, Node.js or other runtime is required to run a released binary.

## Windows 11 (verified)

### Option A — install script (recommended)

```powershell
irm https://raw.githubusercontent.com/hasan19524/OssPilot/main/scripts/install.ps1 -OutFile install.ps1
.\install.ps1 -Url <url-of-osspilot-windows-x64.exe>
```

What it does:
1. Downloads the executable to a temp directory.
2. If `-ChecksumUrl` is given, verifies the SHA-256 checksum and aborts on mismatch.
3. Installs to `%LOCALAPPDATA%\OSSPilot\osspilot.exe`.
4. Adds that directory to your user `PATH`.

Restart the terminal afterwards so `PATH` changes apply.

### Option B — manual

1. Download `osspilot-windows-x64.exe` from a release.
2. Verify the checksum:

```powershell
Get-FileHash .\osspilot-windows-x64.exe -Algorithm SHA256
```

3. Compare with the matching line in `SHA256SUMS.txt`.
4. Put it somewhere on your `PATH` (or run it by full path).

## Build from source

```bash
git clone <repository-url>
cd osspilot
bun install     # requires Bun >= 1.4
bun run build   # creates dist/osspilot(.exe)
```

## Verify an installation

```bash
osspilot setup
```

Setup reports each component as required or optional and never installs anything.

## First launch

```bash
osspilot                          # TUI
osspilot discover                 # a useful first command
```

Data lives in:

| Path | Contents |
|---|---|
| `~/.osspilot/config/config.json` | User preferences (no secrets) |
| `~/.osspilot/database/` | SQLite state |
| `~/.osspilot/repositories/` | Cloned repositories |
| `~/.osspilot/worktrees/` | One worktree per contribution |
| `~/.osspilot/logs/` | Application logs |
| `~/.osspilot/sessions/`, `cache/` | Session and HTTP metadata |

Override the root with `OSSPILOT_HOME`.

## Build targets

`bun run release:build` builds for the current OS only, because native modules
(`better-sqlite3`) are platform-specific. The release workflow builds all targets on
their own runners.

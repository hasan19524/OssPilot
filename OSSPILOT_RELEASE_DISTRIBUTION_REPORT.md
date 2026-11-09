# OSSPilot - Release Distribution Report

## Status: PREPARED, NOT PUBLISHED

Nothing has been pushed, tagged or uploaded. All commands below require Hasan's explicit
approval.

## Artifacts produced locally

```bash
bun run release:build 0.1.0
```

| Target | Artifact | Built here | CI |
|---|---|---|---|
| Windows x64 | `osspilot-windows-x64.exe` | yes | yes |
| Linux x64 | `osspilot-linux-x64` | no (OS-specific) | yes |
| macOS arm64 | `osspilot-darwin-arm64` | no (OS-specific) | yes |
| SHA-256 | `SHA256SUMS.txt` | generated | generated |

## Workflows

### `.github/workflows/ci.yml`
On push/PR: checkout -> setup-bun -> install -> typecheck -> lint -> test -> `build:js`.

### `.github/workflows/release.yml`
On tag `v*`:
1. `test` job - typecheck, lint, test, build:js on ubuntu.
2. `build` job - matrix of windows-x64, linux-x64, darwin-arm64; each regenerates the
   embedded migrations, compiles, and uploads the artifact.
3. `checksums` job - downloads all artifacts and generates `SHA256SUMS.txt`.

Tag push is the trigger. `workflow_dispatch` exists for dry runs; it does not push a tag.

## Installer

`scripts/install.ps1`:
1. Downloads the executable from a `-Url` you supply.
2. Verifies the checksum when `-ChecksumUrl` is supplied (aborts on mismatch).
3. Installs to `%LOCALAPPDATA%\OSSPilot\`.
4. Adds that directory to your user `PATH`.

No external download happens unless you pass a URL.

## Packaging notes

- `better-sqlite3` is a native module; each artifact must be built on its target OS.
- OpenTUI's `@opentui/core` native binary is bundled by `bun build --compile`.
- The migrations folder is embedded, so the binary is genuinely standalone.
- `OSSPILOT_HOME` isolates data for the install verification.

## Code signing

Not configured. Windows will warn about an unrecognised publisher. A certificate would be
required; not purchased.

## To publish (approval-gated)

```bash
git tag v0.1.0
git push origin v0.1.0          # requires approval
# wait for CI
# create the GitHub release, attach artifacts + SHA256SUMS.txt
# update install URLs in README.md and docs/INSTALLATION.md
```
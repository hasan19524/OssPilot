# OSSPilot - Release Distribution Report

## Status: PREPARED, NOT PUBLISHED

Nothing has been pushed, tagged or uploaded.

## Artifacts

```bash
bun run release:build 0.1.0
```

| Target | Artifact | Built here | CI |
|---|---|---|---|
| Windows x64 | osspilot-windows-x64.exe | yes | yes |
| Linux x64 | osspilot-linux-x64 | no (OS-specific) | yes |
| macOS arm64 | osspilot-darwin-arm64 | no (OS-specific) | yes |
| SHA-256 | SHA256SUMS.txt | generated | generated |

## Workflows

### .github/workflows/ci.yml
On push/PR: checkout -> setup-bun -> install -> typecheck -> lint -> test -> build:js.

### .github/workflows/release.yml
On tag v*:
1. test job - typecheck, lint, test, build:js on ubuntu.
2. build job - matrix of windows-x64, linux-x64, darwin-arm64; each regenerates the
   embedded migrations, compiles, uploads the artifact.
3. checksums job - generates SHA256SUMS.txt.

## Installer

scripts/install.ps1: downloads from a -Url you supply, verifies the checksum when
-ChecksumUrl is given (aborts on mismatch), installs to %LOCALAPPDATA%\OSSPilot\,
adds to your user PATH. No external download happens unless you pass a URL.

## Packaging notes

- better-sqlite3 is native; each artifact must be built on its target OS.
- OpenTUI's native binary is bundled by bun build --compile.
- Migrations are embedded, so the binary is genuinely standalone.

## Code signing

Not configured. Windows will warn about an unrecognised publisher.

## To publish (approval-gated)

git tag v0.1.0
git push origin v0.1.0
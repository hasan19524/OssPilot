# Release Process

Nothing has been published. This document describes the intended process and the exact
commands Hasan must approve before running.

## Versioning

Semantic versioning. Tags are `vMAJOR.MINOR.PATCH`.

## Pre-release checks

```bash
bun install
bun run typecheck
bun run lint
bun run test
bun run test:coverage
bun run build
bash scripts/verify-install.sh dist/osspilot.exe    # POSIX
# or, on Windows, the manual clean HOME test (see installation.md)
```

## Local build

```bash
bun run release:build 0.1.0
```

Produces `dist/osspilot-<os>-<arch>` and `dist/SHA256SUMS.txt`.

Native modules (`better-sqlite3`) are platform-specific, so a local build only produces
the binary for the OS you run on.

## CI build

`.github/workflows/release.yml` runs on tag push:

| Job | What it does |
|---|---|
| `test` | typecheck, lint, test, `build:js` on ubuntu |
| `build` | matrix of windows-x64, linux-x64, darwin-arm64; uploads artifacts |
| `checksums` | generates `SHA256SUMS.txt` from all artifacts |

Upload to a release manually or extend the workflow with a release-publishing step.

## Manual release steps

1. `git tag v0.1.0 && git push origin v0.1.0` — **requires approval**.
2. Wait for the workflow to finish.
3. Download all three artifacts and `SHA256SUMS.txt`.
4. Verify each checksum locally.
5. Create a GitHub release with generated notes and attach the artifacts.
6. Update the install script URL in `README.md` / `installation.md`.
7. Smoke test the Windows binary from a clean `OSSPILOT_HOME`.

## Signing

No code signing is configured. Windows will show a SmartScreen warning for an
unrecognised publisher — that is expected and documented. Codesigning requires a
certificate purchase and is not implemented.

## What has NOT happened

- No tag pushed.
- No release created.
- No binary published.
- No package published to any registry.
#!/usr/bin/env bash
# Build OSSPilot release artifacts locally and generate SHA-256 checksums.
#
# Only build targets for the platform you are running on, or ensure the
# native modules (better-sqlite3) are available for each target.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="${1:-0.1.0}"
OUT="dist"

echo "==> Regenerating bundled migrations"
python scripts/generate-migrations.py

mkdir -p "$OUT"

build_target() {
  local target="$1"
  local artifact="$2"
  echo "==> Building $target -> $OUT/$artifact"
  bun build src/index.ts --compile --target="$target" --outfile "$OUT/$artifact"
}

# Build only what the current OS can build. Cross-platform native modules
# (better-sqlite3) are produced by CI on each OS.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    build_target "bun-windows-x64" "osspilot-windows-x64.exe"
    ;;
  Darwin)
    if [ "$(uname -m)" = "arm64" ]; then
      build_target "bun-darwin-arm64" "osspilot-darwin-arm64"
    else
      build_target "bun-darwin-x64" "osspilot-darwin-x64"
    fi
    ;;
  Linux)
    build_target "bun-linux-x64" "osspilot-linux-x64"
    ;;
esac

echo "==> Generating checksums"
( cd "$OUT" && sha256sum * > SHA256SUMS.txt )
cat "$OUT/SHA256SUMS.txt"

echo "==> Done. Version: $VERSION"

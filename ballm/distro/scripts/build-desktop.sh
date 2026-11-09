#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# TODO(ballm): set appId, productName, icons, and the publish feed in
# packages/desktop/electron-builder.config.ts before producing a release build.
bun run --cwd packages/desktop build

echo "Desktop artifacts are under packages/desktop/dist"

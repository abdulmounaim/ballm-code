#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

# TODO(ballm): apply product branding to packages/cli and packages/desktop before building.
# The output still carries upstream names until branding lands.
bun run --cwd packages/cli build

echo "CLI artifacts are under packages/cli/dist"

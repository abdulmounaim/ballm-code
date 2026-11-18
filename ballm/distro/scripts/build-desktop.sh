#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

export OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-prod}"
export OPENCODE_VERSION="${OPENCODE_VERSION:-2.3.0}"

if [[ ! -d packages/cli/dist ]]; then
  echo "Building the CLI first: production desktop builds bundle it."
  "$ROOT/ballm/distro/scripts/build-cli.sh"
fi

bun run --cwd packages/desktop pack

echo "Desktop artifacts are under dist/desktop"

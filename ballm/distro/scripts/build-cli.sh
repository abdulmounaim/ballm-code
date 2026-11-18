#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

export OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-prod}"
export OPENCODE_VERSION="${OPENCODE_VERSION:-2.3.0}"

args=(--single)
if [[ "$(uname -m)" == "x86_64" ]]; then
  args+=(--baseline)
fi
if [[ "${BALLM_SKIP_WEB_UI:-0}" == "1" ]]; then
  args+=(--skip-web-ui)
fi

bun run --cwd packages/cli build -- "${args[@]}"

echo "CLI artifacts are under packages/cli/dist"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is not installed. Install Bun 1.4.4 first: https://bun.sh" >&2
  exit 1
fi

EXPECTED="$(sed -n 's/^bun=//p' ballm/upstream.lock 2>/dev/null || true)"
ACTUAL="$(bun --version)"
echo "bun $ACTUAL"
if [[ -n "$EXPECTED" && "$EXPECTED" != "$ACTUAL" ]]; then
  echo "warning: ballm/upstream.lock pins bun $EXPECTED but found $ACTUAL" >&2
fi

bun install
(cd ballm/backend && bun install)
(cd ballm/distro && bun install)

if [[ ! -f ballm/backend/.env ]]; then
  cp ballm/backend/.env.example ballm/backend/.env
  echo "created ballm/backend/.env"
fi

echo "bootstrap complete"

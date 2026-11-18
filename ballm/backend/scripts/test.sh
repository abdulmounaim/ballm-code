#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="ballm-test-postgres"
PORT="${BALLM_TEST_POSTGRES_PORT:-55432}"

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "TEST_DATABASE_URL is unset and Docker is unavailable." >&2
    echo "Provide TEST_DATABASE_URL=postgres://user:pass@host:5432/db or install Docker." >&2
    exit 1
  fi

  echo "starting disposable Postgres on 127.0.0.1:${PORT}"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run --rm -d \
    --name "$CONTAINER" \
    -e POSTGRES_USER=ballm \
    -e POSTGRES_PASSWORD=ballm \
    -e POSTGRES_DB=ballm_test \
    -p "127.0.0.1:${PORT}:5432" \
    --tmpfs /var/lib/postgresql/data \
    postgres:17-alpine >/dev/null

  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  trap cleanup EXIT

  # pg_isready can report ready while the postmaster is still finishing recovery, so wait for a
  # real query instead.
  for _ in $(seq 1 120); do
    if docker exec "$CONTAINER" psql -U ballm -d ballm_test -tAc 'select 1' >/dev/null 2>&1; then break; fi
    sleep 0.5
  done

  export TEST_DATABASE_URL="postgres://ballm:ballm@127.0.0.1:${PORT}/ballm_test"
fi

export BALLM_ENCRYPTION_KEY="${BALLM_ENCRYPTION_KEY:-$(head -c 32 /dev/urandom | base64)}"
export BALLM_JWT_KID="${BALLM_JWT_KID:-test-key}"

bun test "$@"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: $0 <version>   e.g. $0 2.3.0" >&2
  exit 1
fi

# Electron's updater treats a prerelease suffix as a prerelease build. Ship plain semver.
if [[ ! "$TAG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release version must be plain semver, for example 2.3.0" >&2
  exit 1
fi

export OPENCODE_VERSION="$TAG"
export OPENCODE_CHANNEL="${OPENCODE_CHANNEL:-prod}"

OUT="ballm/dist"
mkdir -p "$OUT"

echo "== verify =="
"ballm/distro/scripts/verify.sh"

echo "== build CLI =="
"ballm/distro/scripts/build-cli.sh"

echo "== build desktop =="
"ballm/distro/scripts/build-desktop.sh"

echo "== stage artifacts =="
cp -R packages/cli/dist "$OUT/cli" 2>/dev/null || true
cp -R dist/desktop "$OUT/desktop" 2>/dev/null || true
cp -R ballm/managed "$OUT/managed"

cat > "$OUT/release.json" <<EOF
{
  "tag": "$TAG",
  "commit": "$(git rev-parse HEAD)",
  "upstream": "$(sed -n 's/^commit=//p' ballm/upstream.lock)",
  "built": "$(date -u +%FT%TZ)"
}
EOF

echo "staged $OUT. Upload installers and latest*.yml with your artifact tool."

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "usage: $0 <tag>   e.g. $0 2.2.5-ballm.1" >&2
  exit 1
fi

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
cp -R packages/desktop/dist "$OUT/desktop" 2>/dev/null || true
cp -R ballm/managed "$OUT/managed"

cat > "$OUT/release.json" <<EOF
{
  "tag": "$TAG",
  "commit": "$(git rev-parse HEAD)",
  "upstream": "$(sed -n 's/^commit=//p' ballm/upstream.lock)",
  "built": "$(date -u +%FT%TZ)"
}
EOF

echo "staged $OUT. Upload with your artifact tool, then point the update feed at $TAG."

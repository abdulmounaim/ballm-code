#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "== backend tests =="
(cd ballm/backend && bun test)

echo "== core typecheck =="
(cd packages/core && bun typecheck)

echo "== managed policy JSON =="
for file in ballm/managed/linux/opencode.jsonc ballm/managed/windows/opencode.jsonc; do
  bun -e "const text = await Bun.file('$file').text(); JSON.parse(text.replace(/^\\s*\\/\\/.*$/gm, '')); console.log('ok $file')"
done

echo "verify complete"

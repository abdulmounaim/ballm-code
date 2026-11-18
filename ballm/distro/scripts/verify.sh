#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

echo "== backend typecheck =="
(cd ballm/backend && bun run typecheck)

echo "== backend tests =="
(cd ballm/backend && bun run test)

echo "== console typecheck =="
(cd ballm/backend/console && bun run typecheck)

echo "== console tests =="
(cd ballm/backend/console && bun test)

echo "== console build =="
(cd ballm/backend/console && bun run build)

echo "== policy tests =="
(cd ballm/tests && bun test e2e)

echo "== core typecheck =="
(cd packages/core && bun typecheck)

echo "== brand typecheck =="
(cd packages/schema && bun typecheck && bun test test/brand.test.ts)

echo "== desktop typecheck =="
(cd packages/desktop && bun typecheck)

echo "== app typecheck =="
(cd packages/app && bun typecheck)

echo "== managed policy JSON =="
for file in ballm/managed/linux/opencode.jsonc ballm/managed/windows/opencode.jsonc; do
  bun -e "const text = await Bun.file('$file').text(); JSON.parse(text.replace(/^\\s*\\/\\/.*$/gm, '')); console.log('ok $file')"
done

echo "== brand audit =="
(cd ballm/distro && bun run brand-audit)

echo "verify complete"

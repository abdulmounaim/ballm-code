#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

LOCK="ballm/upstream.lock"
PINNED="$(sed -n 's/^commit=//p' "$LOCK")"
BRANCH="$(sed -n 's/^branch=//p' "$LOCK")"
REMOTE="$(sed -n 's/^remote=//p' "$LOCK")"

if ! git remote get-url upstream >/dev/null 2>&1; then
  git remote add upstream "$REMOTE"
fi

git fetch upstream "$BRANCH"
CANDIDATE="$(git rev-parse "upstream/$BRANCH")"

echo "pinned:    $PINNED"
echo "candidate: $CANDIDATE"
if [[ "$PINNED" == "$CANDIDATE" ]]; then
  echo "up to date"
  exit 0
fi

echo
echo "Commits to integrate:"
git log --oneline "$PINNED..$CANDIDATE" | head -40 || true
echo

read -r -p "Rebase internal/main onto upstream/$BRANCH? [y/N] " answer
if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
  exit 0
fi

git rebase "upstream/$BRANCH"
VERSION="$(bun -e "console.log(require('./package.json').version)")"
sed -i.bak "s/^commit=.*/commit=$CANDIDATE/" "$LOCK"
sed -i.bak "s/^version=.*/version=$VERSION/" "$LOCK"
sed -i.bak "s/^synced=.*/synced=$(date +%F)/" "$LOCK"
rm -f "$LOCK.bak"

echo "updated $LOCK"
echo "run 'make -C ballm verify' before pushing"

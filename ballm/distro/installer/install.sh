#!/usr/bin/env bash
set -euo pipefail

# Placeholder installer. Replace the download and signature verification with the internal artifact
# store before distribution.
BALLM_VERSION="${BALLM_VERSION:-latest}"
BALLM_BASE="${BALLM_BASE:-https://artifacts.ballm.internal/ballm-code}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
MANAGED_DIR="${MANAGED_DIR:-/etc/opencode}"

echo "Installing Ballm Code $BALLM_VERSION"
echo "TODO: download from $BALLM_BASE/$BALLM_VERSION and verify the signature."

mkdir -p "$INSTALL_DIR"
if [[ ! -w "$MANAGED_DIR" && "$(id -u)" -ne 0 ]]; then
  echo "warning: cannot write $MANAGED_DIR without root; managed policy not installed" >&2
else
  mkdir -p "$MANAGED_DIR"
  cp "$(dirname "$0")/../../managed/linux/opencode.jsonc" "$MANAGED_DIR/opencode.jsonc"
  chmod 0644 "$MANAGED_DIR/opencode.jsonc"
  echo "installed managed policy to $MANAGED_DIR/opencode.jsonc"
fi

echo "Run 'ballm' and connect the Ballm integration."

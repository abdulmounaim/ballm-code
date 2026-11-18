#!/usr/bin/env bash
set -euo pipefail

# Installs the CLI bundled with Ballm Code Desktop, or a downloaded build, as `ballm`.
# The desktop passes --binary <bundled executable>; a standalone install can pass
# --version <version> once the artifact feed is live.

BALLM_HOME="${BALLM_HOME:-$HOME/.ballm}"
BIN_DIR="$BALLM_HOME/bin"
BINARY_SOURCE=""
VERSION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --binary)
      BINARY_SOURCE="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BINARY_SOURCE" ]]; then
  if [[ -z "$VERSION" ]]; then
    echo "BALLM_VERSION or --version is required without --binary" >&2
    exit 1
  fi
  echo "Downloading Ballm Code CLI $VERSION is not configured yet." >&2
  exit 1
fi

mkdir -p "$BIN_DIR"
install -m 0755 "$BINARY_SOURCE" "$BIN_DIR/ballm"

echo "Installed $BIN_DIR/ballm"
echo
echo "Add the CLI to your PATH if it is not already there:"
echo "  export PATH=\"$BIN_DIR:\$PATH\""

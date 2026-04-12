#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

BUNDLE_NAME="network-manager-bundle"
TARBALL="${BUNDLE_NAME}.tar.gz"
DIR_NAME="$(basename "$SCRIPT_DIR")"

echo "=== Building project ==="
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
npm run build

echo ""
echo "=== Creating bundle tarball ==="
cd ..
tar czf "$SCRIPT_DIR/$TARBALL" \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.db' \
  --exclude='node_modules' \
  --exclude='vendor' \
  --exclude="$TARBALL" \
  "$DIR_NAME"

cd "$SCRIPT_DIR"
SIZE=$(du -h "$TARBALL" | cut -f1)
echo ""
echo "=== Bundle created ==="
echo "  File: $TARBALL"
echo "  Size: $SIZE"
echo ""
echo "=== To deploy on the target system ==="
echo "  1. Install Node.js v20 (via package manager or nvm)"
echo "  2. Transfer and extract:"
echo "       tar xzf $TARBALL"
echo "       cd $DIR_NAME"
echo "  3. Run setup (offline or online):"
echo "       ./scripts/setup-offline.sh   # if vendor-deps.tar.gz is included"
echo "       ./scripts/setup.sh           # if internet is available"

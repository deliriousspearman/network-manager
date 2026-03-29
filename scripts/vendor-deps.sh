#!/usr/bin/env bash
# Downloads all npm dependencies into vendor/ for offline deployment.
# Run this on an internet-connected machine, then transfer the whole
# project directory (including vendor/) to the target.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
VENDOR_CACHE="$ROOT_DIR/vendor/npm-cache"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()    { echo "  $*"; }
success() { echo "✓ $*"; }
error()   { echo "✗ $*" >&2; exit 1; }
header()  { echo; echo "── $* ──"; }

# ── Prerequisites ──────────────────────────────────────────────────────────────

header "Checking prerequisites"

# Source nvm if available
if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
fi

command -v node >/dev/null 2>&1 || error "node not found. Install Node.js (via nvm recommended)."
command -v npm  >/dev/null 2>&1 || error "npm not found."

success "node $(node --version), npm $(npm --version)"

# ── Clean old vendor cache ────────────────────────────────────────────────────

header "Preparing vendor cache"

if [[ -d "$VENDOR_CACHE" ]]; then
  info "Removing old vendor cache..."
  rm -rf "$VENDOR_CACHE"
fi

mkdir -p "$VENDOR_CACHE"

# ── Download dependencies ─────────────────────────────────────────────────────

header "Downloading dependencies into vendor cache"

cd "$ROOT_DIR"
npm ci --cache "$VENDOR_CACHE"

# ── Verify ────────────────────────────────────────────────────────────────────

header "Verifying vendor cache"

if [[ ! -d "$VENDOR_CACHE/_cacache" ]]; then
  error "Cache verification failed: _cacache directory not found in vendor/npm-cache"
fi

success "Cache populated"

CACHE_SIZE=$(du -sh "$VENDOR_CACHE" | cut -f1)
info "Cache size: $CACHE_SIZE"

if [[ -d "$VENDOR_CACHE/_prebuilds" ]]; then
  success "Native prebuilds cached (better-sqlite3)"
else
  info "No prebuilds cached — target machine will need build tools (python3, make, g++)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════"
echo "  Vendor cache ready!"
echo ""
echo "  Node:     $(node --version)"
echo "  Platform: $(uname -m)"
echo "  Cache:    vendor/npm-cache ($CACHE_SIZE)"
echo ""
echo "  Next steps:"
echo "    1. Transfer this project to the offline machine"
echo "    2. Run: ./scripts/setup-offline.sh"
echo ""
echo "  Note: Native bindings (better-sqlite3) are"
echo "  platform-specific. The target machine must have"
echo "  the same OS/arch and Node.js major version, or"
echo "  have build tools (python3, make, g++) installed."
echo "══════════════════════════════════════════"

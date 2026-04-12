#!/usr/bin/env bash
# Downloads all npm dependencies and packs them into vendor-deps.tar.gz
# for offline deployment. Run this on an internet-connected machine,
# then commit vendor-deps.tar.gz to git.
#
# The setup-offline.sh script extracts and installs from this archive.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
VENDOR_DIR="$ROOT_DIR/vendor"
VENDOR_CACHE="$VENDOR_DIR/npm-cache"
TARBALL="$ROOT_DIR/vendor-deps.tar.gz"

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

# ── Clean old artifacts ──────────────────────────────────────────────────────

header "Preparing"

if [[ -d "$VENDOR_DIR" ]]; then
  info "Removing old vendor directory..."
  rm -rf "$VENDOR_DIR"
fi

if [[ -f "$TARBALL" ]]; then
  info "Removing old vendor-deps.tar.gz..."
  rm -f "$TARBALL"
fi

mkdir -p "$VENDOR_CACHE"

# ── Download dependencies ─────────────────────────────────────────────────────

header "Downloading dependencies into cache"

cd "$ROOT_DIR"
npm ci --cache "$VENDOR_CACHE"

# ── Verify cache ─────────────────────────────────────────────────────────────

header "Verifying cache"

if [[ ! -d "$VENDOR_CACHE/_cacache" ]]; then
  error "Cache verification failed: _cacache directory not found"
fi

CACHE_SIZE=$(du -sh "$VENDOR_CACHE" | cut -f1)
success "Cache populated ($CACHE_SIZE)"

if [[ -d "$VENDOR_CACHE/_prebuilds" ]]; then
  success "Native prebuilds cached (better-sqlite3)"
else
  info "No prebuilds cached — target machine will need build tools (python3, make, g++)"
fi

# ── Pack into tar.gz ──────────────────────────────────────────────────────────

header "Creating vendor-deps.tar.gz"

tar czf "$TARBALL" -C "$VENDOR_DIR" npm-cache

TARBALL_SIZE=$(du -sh "$TARBALL" | cut -f1)
success "vendor-deps.tar.gz created ($TARBALL_SIZE)"

# ── Clean up temp vendor dir ─────────────────────────────────────────────────

rm -rf "$VENDOR_DIR"
success "Cleaned up temporary vendor directory"

# ── Summary ───────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════"
echo "  Vendor archive ready!"
echo ""
echo "  Node:     $(node --version)"
echo "  Platform: $(uname -m)"
echo "  Archive:  vendor-deps.tar.gz ($TARBALL_SIZE)"
echo ""
echo "  Next steps:"
echo "    1. Commit vendor-deps.tar.gz to git"
echo "    2. On the offline machine, clone and run:"
echo "       ./scripts/setup-offline.sh"
echo ""
echo "  Note: Native bindings (better-sqlite3) are"
echo "  platform-specific. The target machine must have"
echo "  the same OS/arch and Node.js major version, or"
echo "  have build tools (python3, make, g++) installed."
echo "══════════════════════════════════════════"

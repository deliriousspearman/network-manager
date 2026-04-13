#!/usr/bin/env bash
# Fully offline setup for Network Manager — no internet required.
#
# Installs everything from bundled files in the dependencies/ directory:
#   - Node.js v20.20.0 (binary tarball)
#   - Node.js headers (for native module compilation, e.g. better-sqlite3)
#   - npm dependencies (from vendor-deps.tar.gz cache archive)
#
# Then builds the project, optionally sets up HTTPS, and creates a
# systemd user service.
#
# Prerequisites:
#   - Linux x86_64
#   - dependencies/node-v20.20.0-linux-x64.tar.gz
#   - dependencies/vendor-deps.tar.gz (from scripts/vendor-deps.sh)
#
# Note: The Node.js binary tarball already includes headers for native
# module compilation (better-sqlite3). A separate headers download is
# not required.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPS_DIR="$ROOT_DIR/dependencies"
SERVICE_FILE="$HOME/.config/systemd/user/network-manager.service"
CERT_DIR="$ROOT_DIR/server/certs"

NODE_VERSION="20.20.0"
NODE_TARBALL="$DEPS_DIR/node-v${NODE_VERSION}-linux-x64.tar.gz"
VENDOR_TARBALL="$DEPS_DIR/vendor-deps.tar.gz"
NODE_INSTALL_DIR="$HOME/.local/node"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()    { echo "  $*"; }
success() { echo "✓ $*"; }
error()   { echo "✗ $*" >&2; exit 1; }
header()  { echo; echo "── $* ──"; }

# ══════════════════════════════════════════════════════════════════════════════
# Phase 1: Validate bundled files
# ══════════════════════════════════════════════════════════════════════════════

header "Checking bundled dependencies"

[[ -f "$NODE_TARBALL" ]]   || error "Missing: dependencies/node-v${NODE_VERSION}-linux-x64.tar.gz"
[[ -f "$VENDOR_TARBALL" ]] || error "Missing: dependencies/vendor-deps.tar.gz"

info "Node.js tarball:  $(du -sh "$NODE_TARBALL" | cut -f1)"
info "Vendor cache:     $(du -sh "$VENDOR_TARBALL" | cut -f1)"
success "All dependency files found"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 2: Install Node.js
# ══════════════════════════════════════════════════════════════════════════════

header "Installing Node.js v${NODE_VERSION}"

mkdir -p "$NODE_INSTALL_DIR"
tar xzf "$NODE_TARBALL" -C "$NODE_INSTALL_DIR"

# Create/update 'current' symlink for easy PATH reference
ln -sfn "$NODE_INSTALL_DIR/node-v${NODE_VERSION}-linux-x64" "$NODE_INSTALL_DIR/current"

NODE_BIN="$NODE_INSTALL_DIR/current/bin"
export PATH="$NODE_BIN:$PATH"

# Add to PATH permanently if not already there
if ! grep -qF '.local/node/current/bin' "$HOME/.bashrc" 2>/dev/null; then
  {
    echo ""
    echo "# Node.js (installed by network-manager setup)"
    echo 'export PATH="$HOME/.local/node/current/bin:$PATH"'
  } >> "$HOME/.bashrc"
  info "Added Node.js to PATH in ~/.bashrc"
fi

success "node $(node --version), npm $(npm --version)"
info "Installed to $NODE_INSTALL_DIR/current"

# ══════════════════════════════════════════════════════════════════════════════
# Phase 3: Collect user inputs before making changes
# ══════════════════════════════════════════════════════════════════════════════

# ── Mode ───────────────────────────────────────────────────────────────────────

header "Mode"

read -rp "  Run in development or production? (dev/prod) [prod]: " INPUT_MODE
MODE="${INPUT_MODE:-prod}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  error "Invalid mode '$MODE'. Enter 'dev' or 'prod'."
fi

# ── Domain (development only) ─────────────────────────────────────────────────

VITE_DOMAIN=""
if [[ "$MODE" == "dev" ]]; then
  header "Domain (optional)"
  read -rp "  Custom domain/hostname for reverse proxy access? (leave blank to skip): " INPUT_DOMAIN
  VITE_DOMAIN="${INPUT_DOMAIN:-}"
fi

# ── Configuration (production only) ───────────────────────────────────────────

PORT="3001"
USE_HTTPS=false
PROTOCOL="http"
NEEDS_PORT_CAP=false

if [[ "$MODE" == "prod" ]]; then
  header "Configuration"

  read -rp "  Port [3001]: " INPUT_PORT
  PORT="${INPUT_PORT:-3001}"

  if [[ "$PORT" -lt 1024 ]]; then
    NEEDS_PORT_CAP=true
    echo
    info "⚠  Port $PORT is a privileged port (below 1024)."
    info "   After setup, you will need to grant Node.js permission to bind to it."
    info "   The required command will be shown at the end of setup."
    echo
    read -rp "  Continue with port $PORT? (y/N): " CONFIRM_PORT
    if [[ "${CONFIRM_PORT,,}" != "y" && "${CONFIRM_PORT,,}" != "yes" ]]; then
      error "Setup cancelled. Re-run and choose a port >= 1024, or continue with a low port."
    fi
  fi

  read -rp "  Set up HTTPS with a self-signed certificate? (y/N): " INPUT_HTTPS
  if [[ "${INPUT_HTTPS,,}" == "y" || "${INPUT_HTTPS,,}" == "yes" ]]; then
    command -v openssl >/dev/null 2>&1 || error "openssl not found. Install it or skip HTTPS setup."
    USE_HTTPS=true
    PROTOCOL="https"
  fi
fi

# ── Summary & confirmation ────────────────────────────────────────────────────

header "Setup summary"

info "Mode:    $MODE"
info "Node.js: v${NODE_VERSION}"
if [[ "$MODE" == "dev" ]]; then
  [[ -n "$VITE_DOMAIN" ]] && info "Domain:  $VITE_DOMAIN"
else
  info "Port:    $PORT"
  info "HTTPS:   $USE_HTTPS"
  [[ "$NEEDS_PORT_CAP" == "true" ]] && info "Note:    Privileged port — will need setcap after setup"
fi
echo
read -rp "  Proceed with setup? (Y/n): " CONFIRM_SETUP
if [[ "${CONFIRM_SETUP,,}" == "n" || "${CONFIRM_SETUP,,}" == "no" ]]; then
  info "Setup cancelled. No further changes were made."
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Phase 4: Install npm dependencies from vendor cache
# ══════════════════════════════════════════════════════════════════════════════

header "Installing npm dependencies (offline)"

VENDOR_DIR="$ROOT_DIR/vendor"
VENDOR_CACHE="$VENDOR_DIR/npm-cache"
mkdir -p "$VENDOR_DIR"
tar xzf "$VENDOR_TARBALL" -C "$VENDOR_DIR"

if [[ ! -d "$VENDOR_CACHE/_cacache" ]]; then
  error "Extraction failed: _cacache directory not found in vendor/npm-cache"
fi

success "Vendor cache extracted ($(du -sh "$VENDOR_CACHE" | cut -f1))"

cd "$ROOT_DIR"
npm ci --cache "$VENDOR_CACHE" --prefer-offline
success "Dependencies installed"

# Clean up extracted cache
rm -rf "$VENDOR_DIR"
info "Cleaned up temporary vendor directory"

# ── Build (production only) ────────────────────────────────────────────────────

if [[ "$MODE" == "prod" ]]; then
  header "Building project"
  npm run build
  success "Build complete"
fi

# ── TLS certificate (production + HTTPS only) ──────────────────────────────────

if [[ "$MODE" == "prod" && "$USE_HTTPS" == "true" ]]; then
  header "Generating self-signed certificate"

  mkdir -p "$CERT_DIR"

  openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERT_DIR/key.pem" \
    -out    "$CERT_DIR/cert.pem" \
    -days 3650 -nodes \
    -subj "/CN=localhost" \
    2>/dev/null

  success "Certificate written to server/certs/"

  GITIGNORE="$ROOT_DIR/.gitignore"
  if [[ -f "$GITIGNORE" ]] && ! grep -qxF "server/certs/" "$GITIGNORE"; then
    echo "server/certs/" >> "$GITIGNORE"
    info "Added server/certs/ to .gitignore"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# Phase 5: Systemd service
# ══════════════════════════════════════════════════════════════════════════════

header "Creating systemd user service"

mkdir -p "$(dirname "$SERVICE_FILE")"

if [[ "$MODE" == "dev" ]]; then
  if [[ -n "$VITE_DOMAIN" ]]; then
    ENV_LINES="Environment=NODE_ENV=development
Environment=VITE_ALLOWED_HOST=${VITE_DOMAIN}"
  else
    ENV_LINES="Environment=NODE_ENV=development"
  fi
  EXEC_CMD="npm run dev"
else
  if [[ "$USE_HTTPS" == "true" ]]; then
    ENV_LINES="Environment=NODE_ENV=production
Environment=SSL_PORT=${PORT}
Environment=SSL_CERT=${ROOT_DIR}/server/certs/cert.pem
Environment=SSL_KEY=${ROOT_DIR}/server/certs/key.pem"
  else
    ENV_LINES="Environment=NODE_ENV=production
Environment=PORT=${PORT}"
  fi
  EXEC_CMD="node server/dist/index.js"
fi

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Network Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=PATH=${NODE_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${ENV_LINES}
ExecStart=${NODE_BIN}/node ${ROOT_DIR}/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# Dev mode needs npm which resolves via PATH, so use bash -lc instead
if [[ "$MODE" == "dev" ]]; then
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Network Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=${ROOT_DIR}
Environment=PATH=${NODE_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
${ENV_LINES}
ExecStart=/bin/bash -c 'export PATH="${NODE_BIN}:\$PATH" && npm run dev'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
fi

success "Service file written to $SERVICE_FILE"

# ── Enable & start ──────────────────────────────────────────────────────────────

header "Enabling and starting service"

# Stop if already running (e.g. re-run with new settings)
systemctl --user stop network-manager 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now network-manager

success "network-manager service enabled and started"

# ── Done ────────────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════"
echo "  Setup complete! (${MODE} mode, fully offline)"
echo ""
echo "  Node.js: v${NODE_VERSION}"
echo "  Installed to: ${NODE_INSTALL_DIR}/current"
echo ""
if [[ "$MODE" == "dev" ]]; then
  echo "  Access the app at:"
  echo "    http://$(hostname):8080  (client)"
  echo "    http://$(hostname):3001  (API)"
else
  echo "  Access the app at:"
  echo "    ${PROTOCOL}://$(hostname):${PORT}"
  if [[ "$USE_HTTPS" == "true" ]]; then
    echo ""
    echo "  Note: You may need to accept the self-signed"
    echo "  certificate warning in your browser."
  fi
fi
if [[ "$NEEDS_PORT_CAP" == "true" ]]; then
  echo ""
  echo "  ⚠  Privileged port setup required"
  echo "  Port $PORT requires additional permissions. Run:"
  echo ""
  echo "    sudo setcap 'cap_net_bind_service=+ep' ${NODE_BIN}/node"
  echo ""
  echo "  Then restart:"
  echo "    systemctl --user restart network-manager"
fi
echo ""
echo "  Service management:"
echo "    systemctl --user status  network-manager"
echo "    systemctl --user restart network-manager"
echo "    systemctl --user stop    network-manager"
echo "    systemctl --user start   network-manager"
echo "══════════════════════════════════════════"

#!/usr/bin/env bash
# Sets up the Network Manager app from vendored dependencies (no internet needed):
#   - Extracts vendor-deps.tar.gz (npm cache archive)
#   - Installs npm dependencies from the extracted cache
#   - Optionally builds the project (production only)
#   - Optionally generates a self-signed TLS certificate (production only)
#   - Creates and enables a systemd user service
#
# Prerequisites:
#   - Node.js already installed
#   - vendor-deps.tar.gz in the project root (from scripts/vendor-deps.sh)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
SERVICE_FILE="$HOME/.config/systemd/user/network-manager.service"
CERT_DIR="$ROOT_DIR/server/certs"
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

# ── Extract vendor archive ───────────────────────────────────────────────────

header "Extracting vendor dependencies"

if [[ ! -f "$TARBALL" ]]; then
  error "vendor-deps.tar.gz not found. Run scripts/vendor-deps.sh on an internet-connected machine first."
fi

info "Archive: $(du -sh "$TARBALL" | cut -f1)"
mkdir -p "$VENDOR_DIR"
tar xzf "$TARBALL" -C "$VENDOR_DIR"

if [[ ! -d "$VENDOR_CACHE/_cacache" ]]; then
  error "Extraction failed: _cacache directory not found in vendor/npm-cache"
fi

success "Vendor cache extracted ($(du -sh "$VENDOR_CACHE" | cut -f1))"

# ── Mode ───────────────────────────────────────────────────────────────────────

header "Mode"

read -rp "  Run in development or production? (dev/prod) [prod]: " INPUT_MODE
MODE="${INPUT_MODE:-prod}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  error "Invalid mode '$MODE'. Enter 'dev' or 'prod'."
fi

info "Mode: $MODE"

# ── Domain (development only) ─────────────────────────────────────────────────

VITE_DOMAIN=""
if [[ "$MODE" == "dev" ]]; then
  header "Domain (optional)"
  read -rp "  Custom domain/hostname for reverse proxy access? (leave blank to skip): " INPUT_DOMAIN
  VITE_DOMAIN="${INPUT_DOMAIN:-}"
  if [[ -n "$VITE_DOMAIN" ]]; then
    info "Allowed host: $VITE_DOMAIN"
  fi
fi

# ── Configuration (production only) ───────────────────────────────────────────

PORT="3001"
USE_HTTPS=false
PROTOCOL="http"

if [[ "$MODE" == "prod" ]]; then
  header "Configuration"

  read -rp "  Port [3001]: " INPUT_PORT
  PORT="${INPUT_PORT:-3001}"

  read -rp "  Set up HTTPS with a self-signed certificate? (y/N): " INPUT_HTTPS
  if [[ "${INPUT_HTTPS,,}" == "y" || "${INPUT_HTTPS,,}" == "yes" ]]; then
    command -v openssl >/dev/null 2>&1 || error "openssl not found. Install it or skip HTTPS setup."
    USE_HTTPS=true
    PROTOCOL="https"
  fi

  info "Port:  $PORT"
  info "HTTPS: $USE_HTTPS"
fi

# ── Install dependencies (offline) ───────────────────────────────────────────

header "Installing dependencies (offline)"
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

  # Add server/certs/ to .gitignore if not already listed
  GITIGNORE="$ROOT_DIR/.gitignore"
  if [[ -f "$GITIGNORE" ]] && ! grep -qxF "server/certs/" "$GITIGNORE"; then
    echo "server/certs/" >> "$GITIGNORE"
    info "Added server/certs/ to .gitignore"
  fi
fi

# ── Systemd service ────────────────────────────────────────────────────────────

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
${ENV_LINES}
ExecStart=/bin/bash -lc 'export NVM_DIR="\$HOME/.nvm" && . "\$NVM_DIR/nvm.sh" && ${EXEC_CMD}'
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

success "Service file written to $SERVICE_FILE"

# ── Enable & start ──────────────────────────────────────────────────────────────

header "Enabling and starting service"

systemctl --user daemon-reload
systemctl --user enable --now network-manager

success "network-manager service enabled and started"

# ── Done ────────────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════"
echo "  Setup complete! (${MODE} mode, offline)"
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
echo ""
echo "  Service management:"
echo "    systemctl --user status  network-manager"
echo "    systemctl --user restart network-manager"
echo "    systemctl --user stop    network-manager"
echo "    systemctl --user start   network-manager"
echo "══════════════════════════════════════════"

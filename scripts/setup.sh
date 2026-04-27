#!/usr/bin/env bash
# Sets up the Network Manager app:
#   - Installs npm dependencies
#   - Optionally builds the project (production only)
#   - Optionally generates a self-signed TLS certificate (production only)
#   - Creates and enables a systemd user service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_FILE="$HOME/.config/systemd/user/network-manager.service"
CERT_DIR="$ROOT_DIR/server/certs"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()    { echo "  $*"; }
success() { echo "✓ $*"; }
error()   { echo "✗ $*" >&2; exit 1; }
header()  { echo; echo "── $* ──"; }

# ══════════════════════════════════════════════════════════════════════════════
# Phase 1: Collect all user inputs before making any changes
# ══════════════════════════════════════════════════════════════════════════════

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

  # Check if the chosen port requires elevated permissions
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

info "Mode:  $MODE"
if [[ "$MODE" == "dev" ]]; then
  if [[ -n "$VITE_DOMAIN" ]]; then
    info "Domain: $VITE_DOMAIN"
  fi
else
  info "Port:  $PORT"
  info "HTTPS: $USE_HTTPS"
  if [[ "$NEEDS_PORT_CAP" == "true" ]]; then
    info "Note:  Privileged port — will need setcap after setup"
  fi
fi
echo
read -rp "  Proceed with setup? (Y/n): " CONFIRM_SETUP
if [[ "${CONFIRM_SETUP,,}" == "n" || "${CONFIRM_SETUP,,}" == "no" ]]; then
  info "Setup cancelled. No changes were made."
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════════════
# Phase 2: Execute setup (no more user input from this point)
# ══════════════════════════════════════════════════════════════════════════════

# ── Install dependencies ───────────────────────────────────────────────────────

header "Installing dependencies"
cd "$ROOT_DIR"
npm install
success "Dependencies installed"

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

# Stop if already running (e.g. re-run with new settings)
systemctl --user stop network-manager 2>/dev/null || true
systemctl --user daemon-reload
systemctl --user enable --now network-manager

success "network-manager service enabled and started"

# ── Done ────────────────────────────────────────────────────────────────────────

echo
echo "══════════════════════════════════════════"
echo "  Setup complete! (${MODE} mode)"
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
  NODE_BIN="$(which node)"
  echo ""
  echo "  ⚠  Privileged port setup required"
  echo "  Port $PORT requires additional permissions. Run:"
  echo ""
  echo "    sudo setcap 'cap_net_bind_service=+ep' ${NODE_BIN}"
  echo ""
  echo "  This grants Node.js permission to bind to ports"
  echo "  below 1024. You only need to run this once (or"
  echo "  again after updating Node.js). Then restart:"
  echo ""
  echo "    systemctl --user restart network-manager"
fi
echo ""
echo "  Service management:"
echo "    systemctl --user status  network-manager"
echo "    systemctl --user restart network-manager"
echo "    systemctl --user stop    network-manager"
echo "    systemctl --user start   network-manager"
echo "══════════════════════════════════════════"

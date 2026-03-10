#!/usr/bin/env bash
# Resets the server to a clean state by deleting the SQLite database.
# The database will be recreated with empty tables on next server start.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
DB_DIR="$ROOT_DIR/server/data"

echo "This will permanently delete all devices, subnets, connections, and diagram data."
read -rp "Are you sure? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# Check if running as a systemd service
if systemctl is-active --quiet network-manager 2>/dev/null; then
  echo "Stopping systemd service network-manager..."
  sudo systemctl stop network-manager
  rm -f "$DB_DIR/network.db" "$DB_DIR/network.db-shm" "$DB_DIR/network.db-wal"
  echo "Database removed."
  echo "Starting systemd service network-manager..."
  sudo systemctl start network-manager
  echo "Done. The app is running with a fresh empty database."
else
  # Dev mode: kill any running dev server process and restart it
  rm -f "$DB_DIR/network.db" "$DB_DIR/network.db-shm" "$DB_DIR/network.db-wal"
  echo "Database removed."

  # Try to find and kill a running dev server on port 3001
  SERVER_PID=$(lsof -ti :3001 2>/dev/null || true)
  if [[ -n "$SERVER_PID" ]]; then
    echo "Stopping server (PID $SERVER_PID)..."
    kill "$SERVER_PID"
    sleep 1
  fi

  echo "Starting dev server..."
  cd "$ROOT_DIR"
  # Source nvm if available
  if [[ -f "$HOME/.nvm/nvm.sh" ]]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"
  fi
  nohup npm run dev:server > "$ROOT_DIR/server/data/server.log" 2>&1 &
  echo "Dev server started (PID $!). Log: server/data/server.log"
  echo "Done. The app will show an empty database."
fi

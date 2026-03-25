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

# Check if running as a systemd user service
SERVICE_RUNNING=false
if systemctl --user is-active --quiet network-manager 2>/dev/null; then
  SERVICE_RUNNING=true
  echo "Stopping systemd user service network-manager..."
  systemctl --user stop network-manager
fi

rm -f "$DB_DIR/network.db" "$DB_DIR/network.db-shm" "$DB_DIR/network.db-wal"
echo "Database removed."

if [[ "$SERVICE_RUNNING" == "true" ]]; then
  echo "Starting systemd user service network-manager..."
  systemctl --user start network-manager
  echo "Done. The app is running with a fresh empty database."
else
  echo "Done. Start the service with: systemctl --user start network-manager"
fi

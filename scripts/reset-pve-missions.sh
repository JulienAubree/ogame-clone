#!/bin/bash
set -e

# One-shot script: purge all existing PvE missions after the discovery rework.
# Players will get a fresh first discovery when they visit the Missions page.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "==> Loading environment variables..."
export $(grep -v '^#' .env | xargs)

echo "==> Purging existing PvE missions..."
psql "$DATABASE_URL" -c "DELETE FROM pve_missions WHERE status IN ('available', 'in_progress');"

echo "==> Purging mission_center_state (so all players get a fresh first discovery)..."
psql "$DATABASE_URL" -c "DELETE FROM mission_center_state;"

echo "==> Done. Players will receive a new mission on their next visit."

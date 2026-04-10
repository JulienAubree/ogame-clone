#!/bin/bash
set -e

# ============================================================
# Exilium — Deploy Script
# Run from project root: ./scripts/deploy.sh
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
NODE_ENV=development pnpm install --frozen-lockfile

echo "==> Building all packages..."
pnpm exec turbo build

echo "==> Loading environment variables..."
export $(grep -v '^#' .env | xargs)

echo "==> Ensuring uploads directory..."
UPLOADS_DIR="/opt/exilium/uploads/assets"
mkdir -p "$UPLOADS_DIR"/{buildings,research,ships,defenses,planets,flagships}

# Sync assets from web public to uploads (copies missing files, keeps existing)
echo "    Syncing assets from web/public to uploads..."
for cat in buildings research ships defenses; do
  if [ -d "apps/web/public/assets/$cat" ] && [ -n "$(ls -A apps/web/public/assets/$cat/ 2>/dev/null)" ]; then
    cp -n apps/web/public/assets/$cat/* "$UPLOADS_DIR/$cat/" 2>/dev/null || true
  fi
done
# Planets and flagships have subdirectories — use recursive copy
for cat in planets flagships; do
  if [ -d "apps/web/public/assets/$cat" ]; then
    cp -rn apps/web/public/assets/$cat/* "$UPLOADS_DIR/$cat/" 2>/dev/null || true
  fi
done

echo "==> Applying pending database migrations..."
"$PROJECT_DIR/scripts/apply-migrations.sh"

echo "==> Seeding game config..."
pnpm --filter @exilium/db db:seed

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs --update-env

echo "==> Saving PM2 process list..."
pm2 save

echo "==> Reloading Caddy config..."
sudo caddy reload --config "$PROJECT_DIR/Caddyfile" 2>/dev/null || echo "    (Caddy reload skipped — not running or no permission)"

echo ""
echo "==> Deploy complete! Checking status..."
pm2 list

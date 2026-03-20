#!/bin/bash
set -e

# ============================================================
# OGame Clone — Deploy Script
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
UPLOADS_DIR="/opt/ogame-clone/uploads/assets"
mkdir -p "$UPLOADS_DIR"/{buildings,research,ships,defenses,planets}

# Sync assets from web public to uploads (copies missing files, keeps existing)
echo "    Syncing assets from web/public to uploads..."
for cat in buildings research ships defenses planets; do
  if [ -d "apps/web/public/assets/$cat" ] && [ -n "$(ls -A apps/web/public/assets/$cat/ 2>/dev/null)" ]; then
    cp -n apps/web/public/assets/$cat/* "$UPLOADS_DIR/$cat/" 2>/dev/null || true
  fi
done

echo "==> Pushing database schema..."
pnpm --filter @ogame-clone/db db:push

echo "==> Seeding game config..."
pnpm --filter @ogame-clone/db db:seed

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs --update-env

echo "==> Saving PM2 process list..."
pm2 save

echo "==> Reloading Caddy config..."
sudo caddy reload --config "$PROJECT_DIR/Caddyfile" 2>/dev/null || echo "    (Caddy reload skipped — not running or no permission)"

echo ""
echo "==> Deploy complete! Checking status..."
pm2 list

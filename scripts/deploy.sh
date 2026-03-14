#!/bin/bash
set -e

# ============================================================
# OGame Clone — Deploy Script
# Run from project root: ./scripts/deploy.sh
# ============================================================

cd "$(dirname "$0")/.."

echo "==> Pulling latest changes..."
git pull origin main

echo "==> Installing dependencies..."
pnpm install --frozen-lockfile

echo "==> Building all packages..."
pnpm build

echo "==> Pushing database schema..."
export $(grep -v '^#' .env | xargs)
cd packages/db
pnpm db:push
cd ../..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.config.cjs --update-env

echo "==> Saving PM2 process list..."
pm2 save

echo ""
echo "==> Deploy complete! Checking status..."
pm2 list

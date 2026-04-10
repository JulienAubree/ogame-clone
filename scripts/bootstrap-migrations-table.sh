#!/bin/bash
# ============================================================
# One-shot script: bootstrap _migrations tracking table
# Marks all existing migration files as already applied.
# Run this ONCE on a database that was previously managed via db:push.
# After this, deploy.sh will only apply new migrations going forward.
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_DIR/packages/db/drizzle"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set" >&2
  exit 1
fi

PSQL="psql $DATABASE_URL"

echo "==> Creating _migrations table if needed..."
$PSQL -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS _migrations (
  filename varchar(255) PRIMARY KEY,
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);
SQL

echo "==> Marking existing migration files as applied..."
shopt -s nullglob
COUNT=0
for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$migration")
  $PSQL -v ON_ERROR_STOP=1 -q -c "INSERT INTO _migrations (filename) VALUES ('$filename') ON CONFLICT DO NOTHING;"
  COUNT=$((COUNT + 1))
  echo "    marked $filename"
done

echo "==> Done. $COUNT migration files registered."
echo ""
echo "Next deploys will only apply NEW migration files."

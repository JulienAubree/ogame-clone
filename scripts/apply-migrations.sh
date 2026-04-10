#!/bin/bash
# ============================================================
# Apply pending Drizzle SQL migrations
# Tracks applied migrations in a `_migrations` table.
# Replaces the dangerous `drizzle-kit push` for production.
# ============================================================
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_DIR/packages/db/drizzle"

# Source .env to get DATABASE_URL or build it from PG vars
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

# Ensure psql is available
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not installed" >&2
  exit 1
fi

# Use DATABASE_URL directly with psql
PSQL="psql $DATABASE_URL"

# Create migrations tracking table if it doesn't exist
$PSQL -v ON_ERROR_STOP=1 -q <<'SQL'
CREATE TABLE IF NOT EXISTS _migrations (
  filename varchar(255) PRIMARY KEY,
  applied_at timestamp with time zone NOT NULL DEFAULT now()
);
SQL

# Get list of already applied migrations
APPLIED=$($PSQL -t -A -c "SELECT filename FROM _migrations ORDER BY filename;")

# Iterate through migration files in order
shopt -s nullglob
APPLIED_COUNT=0
for migration in "$MIGRATIONS_DIR"/*.sql; do
  filename=$(basename "$migration")
  if echo "$APPLIED" | grep -Fxq "$filename"; then
    continue
  fi

  echo "    Applying $filename..."
  $PSQL -v ON_ERROR_STOP=1 -q -f "$migration"
  $PSQL -v ON_ERROR_STOP=1 -q -c "INSERT INTO _migrations (filename) VALUES ('$filename');"
  APPLIED_COUNT=$((APPLIED_COUNT + 1))
done

if [ $APPLIED_COUNT -eq 0 ]; then
  echo "    No pending migrations."
else
  echo "    Applied $APPLIED_COUNT migration(s)."
fi

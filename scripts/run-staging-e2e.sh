#!/usr/bin/env bash
# Run the staging E2E test suite. Defaults to hitting the staging API directly
# at http://localhost:3001 (no Caddy, no basic auth) — the point is to test
# fleet.service and friends, not the reverse proxy.
#
# Override E2E_STAGING_URL + E2E_STAGING_BASIC_USER/PASS if running from
# outside the VPS.

set -euo pipefail

REPO_ROOT="/opt/exilium"
WEB_DIR="$REPO_ROOT/apps/web"
STAGING_PASS_FILE="/opt/exilium-staging/.staging-password"
USER_EMAIL_DEFAULT="zecharia@staging.local"

if [[ ! -r "$STAGING_PASS_FILE" ]]; then
  echo "FATAL: $STAGING_PASS_FILE missing. Run /opt/exilium/scripts/refresh-staging-from-prod.sh first." >&2
  exit 1
fi

export E2E_STAGING_URL="${E2E_STAGING_URL:-http://localhost:3001}"
export E2E_STAGING_USER_EMAIL="${E2E_STAGING_USER_EMAIL:-$USER_EMAIL_DEFAULT}"
export E2E_STAGING_USER_PASSWORD="$(tr -d '\n\r' < "$STAGING_PASS_FILE")"

cd "$WEB_DIR"
exec pnpm exec playwright test --config=playwright.staging.config.ts "$@"

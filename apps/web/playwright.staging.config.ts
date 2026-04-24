import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the staging env. Separate from the prod smoke config
 * because staging tests mutate DB state.
 *
 * Default target: http://localhost:3001 (staging API, bypasses Caddy basic
 * auth since we run from the VPS). Override E2E_STAGING_URL if running
 * tests from outside the VPS — in that case you'll also need to provide
 * HTTP basic auth credentials via E2E_STAGING_BASIC_USER/PASS.
 *
 * Required env vars:
 *   E2E_STAGING_USER_EMAIL    — e.g. zecharia@staging.local
 *   E2E_STAGING_USER_PASSWORD — shared password from /opt/exilium-staging/.staging-password
 *
 * Run:  bash /opt/exilium/scripts/run-staging-e2e.sh
 */
const hasBasicAuth = !!process.env.E2E_STAGING_BASIC_USER && !!process.env.E2E_STAGING_BASIC_PASS;

export default defineConfig({
  testDir: './e2e/staging',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_STAGING_URL ?? 'http://localhost:3001',
    ...(hasBasicAuth
      ? {
          httpCredentials: {
            username: process.env.E2E_STAGING_BASIC_USER!,
            password: process.env.E2E_STAGING_BASIC_PASS!,
          },
        }
      : {}),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'content-type': 'application/json',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

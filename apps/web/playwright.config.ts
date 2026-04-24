import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright setup for smoke tests against the live site.
 *
 * Tests are intentionally non-destructive (no logins, no mutations) — they
 * verify that the public-facing pages render and the API reference endpoints
 * respond. Full end-to-end scenarios (login → build → fleet → combat) require
 * a separate staging env, tracked as a follow-up.
 *
 * Run: `pnpm --filter @exilium/web test:e2e`
 * Skip in CI: E2E tests are not wired into the default `pnpm test` command.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://exilium-game.com',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

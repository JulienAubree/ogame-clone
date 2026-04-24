import { test, expect } from '@playwright/test';

/**
 * Smoke tests: verify the public entrypoints render without errors.
 * These run against the live site by default (E2E_BASE_URL env var overrides)
 * and must not create any data — they only read publicly available content.
 */

test('landing page renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Exilium/i);
});

test('login page renders the form', async ({ page }) => {
  await page.goto('/login');
  // Either the landing→login flow or a direct login route should surface an
  // email/password form. We just check inputs of those types are present.
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('register page renders the form', async ({ page }) => {
  await page.goto('/register');
  await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
});

test('/health endpoint returns ok with DB and Redis checks', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { status: string; checks: { db: { ok: boolean }; redis: { ok: boolean } } };
  expect(body.status).toBe('ok');
  expect(body.checks.db.ok).toBe(true);
  expect(body.checks.redis.ok).toBe(true);
});

test('tRPC gameConfig.getAll is publicly readable and returns expected shape', async ({ request }) => {
  const res = await request.get('/trpc/gameConfig.getAll');
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { result: { data: { buildings: unknown; research: unknown; ships: unknown } } };
  expect(body.result.data).toBeTruthy();
  expect(body.result.data.buildings).toBeTruthy();
  expect(body.result.data.research).toBeTruthy();
  expect(body.result.data.ships).toBeTruthy();
});

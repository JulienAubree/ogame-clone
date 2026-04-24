import { test, expect } from '@playwright/test';
import { login, makeTRPC } from './trpc-client.js';

/**
 * Characterization tests for game-config admin mutations. Cover the round-trip
 * from an admin mutation (create/update/delete) to a cache read (getAll). If
 * the partial-invalidation refactor breaks propagation, these turn red.
 *
 * Uses a temporary building id prefixed "e2e-" so the test is idempotent and
 * doesn't pollute real config.
 */

const USER_EMAIL = process.env.E2E_STAGING_USER_EMAIL ?? '';
const USER_PASSWORD = process.env.E2E_STAGING_USER_PASSWORD ?? '';

test.describe('game-config admin mutations on staging', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await login(request, USER_EMAIL, USER_PASSWORD);
  });

  test('createBuilding → getAll reflects → updateBuilding → getAll reflects → delete', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const testId = `e2e-building-${Date.now()}`;

    // Cleanup first in case of leftover from a prior failed run.
    await trpc.mutate('gameConfig.admin.deleteBuilding', { id: testId }).catch(() => { /* not present, fine */ });

    // Create
    await trpc.mutate('gameConfig.admin.createBuilding', {
      id: testId,
      name: 'E2E Test Building',
      description: 'Temporary building created by the staging E2E suite',
      baseCostMinerai: 100,
      baseCostSilicium: 50,
      costFactor: 1.5,
      baseTime: 60,
      sortOrder: 999,
    });

    // Read via cached getAll — must appear immediately (cache invalidated)
    let config = await trpc.query<{ buildings: Record<string, { id: string; name: string; baseCost: { minerai: number } }> }>(
      'gameConfig.getAll',
    );
    expect(config.buildings[testId]).toBeDefined();
    expect(config.buildings[testId]!.name).toBe('E2E Test Building');
    expect(config.buildings[testId]!.baseCost.minerai).toBe(100);

    // Update
    await trpc.mutate('gameConfig.admin.updateBuilding', {
      id: testId,
      data: { name: 'E2E Test Building (updated)', baseCostMinerai: 200 },
    });

    config = await trpc.query('gameConfig.getAll');
    expect(config.buildings[testId]!.name).toBe('E2E Test Building (updated)');
    expect(config.buildings[testId]!.baseCost.minerai).toBe(200);

    // Delete
    await trpc.mutate('gameConfig.admin.deleteBuilding', { id: testId });

    config = await trpc.query('gameConfig.getAll');
    expect(config.buildings[testId]).toBeUndefined();
  });

  test('universe_config update propagates through cache', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const testKey = `e2e_test_universe_key`;

    // Create (updateUniverseConfig is upsert, so this works for both create and update)
    await trpc.mutate('gameConfig.admin.updateUniverseConfig', {
      key: testKey,
      value: 42,
    });

    const config1 = await trpc.query<{ universe: Record<string, unknown> }>('gameConfig.getAll');
    expect(config1.universe[testKey]).toBe(42);

    // Update to new value
    await trpc.mutate('gameConfig.admin.updateUniverseConfig', {
      key: testKey,
      value: 99,
    });

    const config2 = await trpc.query<{ universe: Record<string, unknown> }>('gameConfig.getAll');
    expect(config2.universe[testKey]).toBe(99);

    // Cleanup (no direct delete endpoint — leave it; harmless key)
  });
});

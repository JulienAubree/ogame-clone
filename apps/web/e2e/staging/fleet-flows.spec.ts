import { test, expect } from '@playwright/test';
import { login, makeTRPC } from './trpc-client.js';

/**
 * Characterization tests for the fleet orchestration surface. These run
 * against staging — they MUTATE data (send/recall fleets) and depend on a
 * staging refresh from prod so the test account has at least 2 planets and
 * some ships.
 *
 * Purpose: lock down the observable behavior of fleet.service.ts methods
 * that we're about to refactor (sendFleet / recallFleet / listMovements /
 * listInboundFleets / estimateFleet). These tests should keep passing
 * throughout the refactor — if they go red, behavior changed.
 */

const USER_EMAIL = process.env.E2E_STAGING_USER_EMAIL ?? '';
const USER_PASSWORD = process.env.E2E_STAGING_USER_PASSWORD ?? '';

interface Planet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
}

interface Ship {
  id: string;
  count: number;
  isStationary: boolean;
}

/** Find the first (planet, shipId, count) tuple where the planet has movable ships. */
async function pickAvailableShip(
  trpc: ReturnType<typeof makeTRPC>,
): Promise<{ planet: Planet; shipId: string; count: number } | null> {
  const planets = await trpc.query<Planet[]>('planet.list');
  for (const planet of planets) {
    const ships = await trpc.query<Ship[]>('shipyard.ships', { planetId: planet.id });
    const movable = ships.find((s) => !s.isStationary && s.count > 0);
    if (movable) return { planet, shipId: movable.id, count: movable.count };
  }
  return null;
}

async function otherPlanet(trpc: ReturnType<typeof makeTRPC>, excludeId: string): Promise<Planet | null> {
  const planets = await trpc.query<Planet[]>('planet.list');
  return planets.find((p) => p.id !== excludeId) ?? null;
}

test.describe('fleet flows on staging', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    if (!USER_EMAIL || !USER_PASSWORD) {
      throw new Error('E2E_STAGING_USER_EMAIL and E2E_STAGING_USER_PASSWORD must be set');
    }
    token = await login(request, USER_EMAIL, USER_PASSWORD);
    expect(token.length).toBeGreaterThan(50);
  });

  test('auth.login returns a valid access token', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const me = await trpc.query<{ username: string }>('user.getMyProfile');
    expect(me.username).toBeTruthy();
  });

  test('planet.list returns at least 2 planets', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const planets = await trpc.query<Planet[]>('planet.list');
    expect(planets.length).toBeGreaterThanOrEqual(2);
  });

  test('fleet.estimate computes travel time + fuel between two planets', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const picked = await pickAvailableShip(trpc);
    if (!picked) test.skip(true, 'no movable ships on any planet');
    const target = await otherPlanet(trpc, picked!.planet.id);
    if (!target) test.skip(true, 'only one planet — cannot target a sister');

    const estimate = await trpc.query<{ duration: number; fuel: number }>('fleet.estimate', {
      originPlanetId: picked!.planet.id,
      targetGalaxy: target!.galaxy,
      targetSystem: target!.system,
      targetPosition: target!.position,
      ships: { [picked!.shipId]: 1 },
    });
    expect(estimate.duration).toBeGreaterThan(0);
    expect(estimate.fuel).toBeGreaterThanOrEqual(0);
  });

  test('fleet.send + movements + recall: observable state changes as expected', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const picked = await pickAvailableShip(trpc);
    if (!picked) test.skip(true, 'no movable ships on any planet');
    const target = await otherPlanet(trpc, picked!.planet.id);
    if (!target) test.skip(true, 'only one planet — cannot target a sister');

    const sendCount = 1;

    // Baseline: count before sending.
    const shipsBefore = await trpc.query<Ship[]>('shipyard.ships', { planetId: picked!.planet.id });
    const baselineCount = shipsBefore.find((s) => s.id === picked!.shipId)!.count;

    // Station mission: moves ships to another of my planets, no combat, safe
    // to run on staging without side effects.
    const sent = await trpc.mutate<{ event: { id: string } }>('fleet.send', {
      originPlanetId: picked!.planet.id,
      targetGalaxy: target!.galaxy,
      targetSystem: target!.system,
      targetPosition: target!.position,
      mission: 'station',
      ships: { [picked!.shipId]: sendCount },
      mineraiCargo: 0,
      siliciumCargo: 0,
      hydrogeneCargo: 0,
    });
    expect(sent.event.id).toMatch(/^[0-9a-f-]{36}$/);

    // Ships deducted on origin.
    const shipsAfter = await trpc.query<Ship[]>('shipyard.ships', { planetId: picked!.planet.id });
    const afterCount = shipsAfter.find((s) => s.id === picked!.shipId)!.count;
    expect(afterCount).toBe(baselineCount - sendCount);

    // Movement is listed.
    const movements = await trpc.query<Array<{ id: string; mission: string; status: string }>>('fleet.movements');
    const ours = movements.find((m) => m.id === sent.event.id);
    expect(ours).toBeTruthy();
    expect(ours!.mission).toBe('station');
    expect(ours!.status).toBe('active');

    // Recall — the fleet turns around.
    const recalled = await trpc.mutate<{ recalled: boolean }>('fleet.recall', { fleetEventId: sent.event.id });
    expect(recalled.recalled).toBe(true);

    const movementsAfter = await trpc.query<Array<{ id: string; status: string }>>('fleet.movements');
    const oursAfter = movementsAfter.find((m) => m.id === sent.event.id);
    expect(oursAfter).toBeTruthy();
    expect(oursAfter!.status).toBe('active'); // recall just flips the phase, status stays active
  });

  test('fleet.send rejects over-budget ship counts', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const picked = await pickAvailableShip(trpc);
    if (!picked) test.skip(true, 'no movable ships');
    const target = await otherPlanet(trpc, picked!.planet.id);
    if (!target) test.skip(true, 'only one planet');

    await expect(
      trpc.mutate('fleet.send', {
        originPlanetId: picked!.planet.id,
        targetGalaxy: target!.galaxy,
        targetSystem: target!.system,
        targetPosition: target!.position,
        mission: 'station',
        ships: { [picked!.shipId]: picked!.count * 10 + 100 },
        mineraiCargo: 0,
        siliciumCargo: 0,
        hydrogeneCargo: 0,
      }),
    ).rejects.toThrow(/Pas assez|not enough|BAD_REQUEST/i);
  });

  test('fleet.slots reports current count vs maximum', async ({ request }) => {
    const trpc = makeTRPC(request, token);
    const slots = await trpc.query<{ current: number; max: number }>('fleet.slots');
    expect(slots.max).toBeGreaterThan(0);
    expect(slots.current).toBeGreaterThanOrEqual(0);
    expect(slots.current).toBeLessThanOrEqual(slots.max);
  });
});

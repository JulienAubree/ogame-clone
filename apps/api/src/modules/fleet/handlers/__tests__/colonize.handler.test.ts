import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: {
    __t: 'planets',
    id: { __c: 'planets.id' },
    userId: { __c: 'planets.userId' },
    galaxy: { __c: 'planets.galaxy' },
    system: { __c: 'planets.system' },
    position: { __c: 'planets.position' },
    name: { __c: 'planets.name' },
    sortOrder: { __c: 'planets.sortOrder' },
    planetClassId: { __c: 'planets.planetClassId' },
    minerai: { __c: 'planets.minerai' },
    silicium: { __c: 'planets.silicium' },
    hydrogene: { __c: 'planets.hydrogene' },
  },
  planetShips: { __t: 'planetShips' },
  planetDefenses: { __t: 'planetDefenses' },
  fleetEvents: {
    __t: 'fleetEvents',
    id: { __c: 'fleetEvents.id' },
  },
  planetBiomes: { __t: 'planetBiomes' },
  discoveredBiomes: {
    __t: 'discoveredBiomes',
    biomeId: { __c: 'discoveredBiomes.biomeId' },
    userId: { __c: 'discoveredBiomes.userId' },
    galaxy: { __c: 'discoveredBiomes.galaxy' },
    system: { __c: 'discoveredBiomes.system' },
    position: { __c: 'discoveredBiomes.position' },
  },
  discoveredPositions: {
    __t: 'discoveredPositions',
    userId: { __c: 'discoveredPositions.userId' },
    galaxy: { __c: 'discoveredPositions.galaxy' },
    system: { __c: 'discoveredPositions.system' },
    position: { __c: 'discoveredPositions.position' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: 'sql', strings, values }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
  calculateMaxTemp: vi.fn(() => 25),
  calculateMinTemp: vi.fn(() => -10),
  calculateDiameter: vi.fn(() => 12000),
  seededRandom: vi.fn(() => () => 0.5),
  coordinateSeed: vi.fn(() => 42),
  generateBiomeCount: vi.fn(() => 0),
  pickBiomes: vi.fn(() => []),
  pickPlanetTypeForPosition: vi.fn(() => 'temperate'),
  calculateColonizationDifficulty: vi.fn(() => 0.85),
}));

vi.mock('../../../lib/planet-image.util.js', () => ({
  getRandomPlanetImageIndex: vi.fn(() => 1),
}));

import { ColonizeHandler } from '../colonize.handler.js';
import type { MissionHandlerContext, FleetEvent, SendFleetInput } from '../../fleet.types.js';
import { TRPCError } from '@trpc/server';

interface FakePlanet {
  id: string;
  userId?: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  status?: string;
  sortOrder?: number;
  planetClassId?: string | null;
  minerai?: string;
  silicium?: string;
  hydrogene?: string;
}

interface FakeState {
  planets: FakePlanet[];
  insertedPlanets: Array<Record<string, unknown>>;
  insertedPlanetShips: Array<Record<string, unknown>>;
  insertedPlanetDefenses: Array<Record<string, unknown>>;
  insertedDiscoveredPositions: Array<Record<string, unknown>>;
  fleetEventStatusUpdates: number;
  planetCargoUpdates: Array<Record<string, unknown>>;
  homeworld?: { system: number };
}

let state: FakeState;

function tableOf(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  return (token as { __t?: string }).__t ?? null;
}

// Tracks what condition the where() expression refers to, so select chains
// can return the appropriate subset of state.planets.
function buildSelectChain() {
  const ctx: { table: string | null; whereOps: unknown[] } = { table: null, whereOps: [] };
  const chain: any = {
    from(table: unknown) {
      ctx.table = tableOf(table);
      return chain;
    },
    where(cond: unknown) {
      ctx.whereOps.push(cond);
      return chain;
    },
    limit() { return chain; },
    then(resolve: (v: unknown[]) => void) {
      if (ctx.table === 'planets') {
        // Determine if the where filters by planetClassId='homeworld'
        const json = JSON.stringify(ctx.whereOps);
        if (json.includes('homeworld')) {
          resolve(state.homeworld ? [state.homeworld] : []);
          return;
        }
        resolve(state.planets.map(p => ({ ...p })));
        return;
      }
      if (ctx.table === 'discoveredBiomes') {
        resolve([]);
        return;
      }
      resolve([]);
    },
  };
  return chain;
}

function buildInsertChain(table: unknown) {
  const marker = tableOf(table);
  const chain: any = {
    values(vals: any) {
      if (marker === 'planets') {
        const inserted = { id: 'new-planet-id', ...vals };
        state.insertedPlanets.push(inserted);
        // Stash for .returning()
        chain.__returning = [inserted];
      } else if (marker === 'planetShips') {
        state.insertedPlanetShips.push(vals);
      } else if (marker === 'planetDefenses') {
        state.insertedPlanetDefenses.push(vals);
      } else if (marker === 'discoveredPositions') {
        state.insertedDiscoveredPositions.push(vals);
      }
      return chain;
    },
    returning() {
      return Promise.resolve(chain.__returning ?? []);
    },
    onConflictDoNothing() {
      return Promise.resolve();
    },
    onConflictDoUpdate() {
      return Promise.resolve();
    },
  };
  return chain;
}

function buildUpdateChain(table: unknown) {
  const marker = tableOf(table);
  let pendingValues: Record<string, unknown> = {};
  const chain: any = {
    set(values: Record<string, unknown>) { pendingValues = values; return chain; },
    where() {
      if (marker === 'planets') {
        state.planetCargoUpdates.push(pendingValues);
      } else if (marker === 'fleetEvents') {
        state.fleetEventStatusUpdates += 1;
      }
      return Promise.resolve();
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  insert: vi.fn((t: unknown) => buildInsertChain(t)),
  update: vi.fn((t: unknown) => buildUpdateChain(t)),
};

function makeFleetEvent(overrides: Partial<FleetEvent> = {}): FleetEvent {
  return {
    id: 'fe-1',
    userId: 'user-1',
    originPlanetId: 'planet-origin',
    targetPlanetId: null,
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'colonize',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { colonyShip: 1 },
    metadata: null,
    pveMissionId: null,
    tradeId: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue({
        ships: {
          colonyShip: { id: 'colonyShip', role: 'colonization', baseSpeed: 5, fuelConsumption: 1, cargoCapacity: 5000, driveType: 'fusion' },
          cruiser: { id: 'cruiser', role: 'combat', baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 100, driveType: 'fusion' },
        },
        planetTypes: [
          { id: 'temperate', role: 'colony', diameterMin: 10000, diameterMax: 14000 },
          { id: 'homeworld', role: 'homeworld', diameterMin: 10000, diameterMax: 14000 },
        ],
        biomes: [],
        universe: {
          belt_positions: [8, 16],
          colonization_distance_penalty_per_hop: 0.01,
          colonization_distance_floor: 0.9,
          colonization_difficulty_temperate: 1.0,
        },
      }),
    } as any,
    reportService: {
      create: vi.fn().mockResolvedValue({ id: 'report-1' }),
    } as any,
    colonizationService: {
      getOutpostThresholds: vi.fn().mockResolvedValue({ minerai: 1000, silicium: 500 }),
      startProcess: vi.fn().mockResolvedValue({ id: 'proc-1' }),
    } as any,
    fleetQueue: {} as any,
    assetsDir: '/tmp',
    resourceService: {} as any,
    ...overrides,
  } as MissionHandlerContext;
}

function makeInput(overrides: Partial<SendFleetInput> = {}): SendFleetInput {
  return {
    userId: 'user-1',
    originPlanetId: 'planet-origin',
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'colonize',
    ships: { colonyShip: 1 },
    ...overrides,
  };
}

describe('ColonizeHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      insertedPlanets: [],
      insertedPlanetShips: [],
      insertedPlanetDefenses: [],
      insertedDiscoveredPositions: [],
      fleetEventStatusUpdates: 0,
      planetCargoUpdates: [],
      homeworld: { system: 10 },
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws if a non-colonization, non-flagship ship is present', async () => {
      const handler = new ColonizeHandler();
      // 'cruiser' is not a colonization ship and not flagship
      const input = makeInput({ ships: { cruiser: 1 } });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).rejects.toThrow(TRPCError);
    });

    it('allows valid colonization ships', async () => {
      const handler = new ColonizeHandler();
      const input = makeInput({ ships: { colonyShip: 1 } });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).resolves.toBeUndefined();
    });

    it('allows flagship even without colonization role', async () => {
      const handler = new ColonizeHandler();
      const input = makeInput({ ships: { flagship: 1, colonyShip: 1 } });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('aborts with refund when target is an asteroid belt position', async () => {
      const handler = new ColonizeHandler();
      const result = await handler.processArrival(
        makeFleetEvent({
          targetPosition: 8,
          mineraiCargo: '500',
          siliciumCargo: '300',
          hydrogeneCargo: '100',
        }),
        makeCtx(),
      );

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(state.insertedPlanets).toHaveLength(0);
    });

    it('aborts with refund when target position is occupied', async () => {
      state.planets.push({
        id: 'existing-planet',
        userId: 'someone-else',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Already There',
      });
      const handler = new ColonizeHandler();
      const result = await handler.processArrival(
        makeFleetEvent({
          mineraiCargo: '500',
          siliciumCargo: '300',
          hydrogeneCargo: '100',
        }),
        makeCtx(),
      );

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(state.insertedPlanets).toHaveLength(0);
    });

    it('on success: creates the new planet, calls colonizationService.startProcess and creates report', async () => {
      const ctx = makeCtx();
      const handler = new ColonizeHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      // New planet was inserted with status 'colonizing'
      expect(state.insertedPlanets).toHaveLength(1);
      expect(state.insertedPlanets[0]).toMatchObject({
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        status: 'colonizing',
      });

      // Companion rows
      expect(state.insertedPlanetShips).toHaveLength(1);
      expect(state.insertedPlanetDefenses).toHaveLength(1);

      // Colonization process started
      expect(ctx.colonizationService!.startProcess).toHaveBeenCalledTimes(1);
      const startArgs = (ctx.colonizationService!.startProcess as any).mock.calls[0];
      expect(startArgs[0]).toBe('new-planet-id'); // newPlanet.id
      expect(startArgs[1]).toBe('user-1');
      expect(startArgs[2]).toBe('planet-origin');

      // Fleet event marked completed
      expect(state.fleetEventStatusUpdates).toBe(1);

      // Report created with success
      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('colonize');
      expect(reportArg.title).toContain('Colonisation lancée');
      expect(reportArg.result).toMatchObject({ success: true, colonizing: true, planetId: 'new-planet-id' });
      expect(result.reportId).toBe('report-1');
      expect(result.scheduleReturn).toBe(false);
    });

    it('does not return cargo on success (cargo consumed by colony)', async () => {
      const handler = new ColonizeHandler();
      const result = await handler.processArrival(
        makeFleetEvent({
          mineraiCargo: '500',
          siliciumCargo: '300',
          hydrogeneCargo: '100',
        }),
        makeCtx(),
      );

      // No cargo refund — the cargo is poured into the new colony
      expect(result.cargo).toBeUndefined();
      expect(result.scheduleReturn).toBe(false);
    });

    it('passes outpostEstablished=true to startProcess when cargo meets thresholds', async () => {
      const ctx = makeCtx();
      // thresholds default to 1000/500
      const handler = new ColonizeHandler();
      await handler.processArrival(
        makeFleetEvent({
          mineraiCargo: '1500',
          siliciumCargo: '700',
          hydrogeneCargo: '0',
        }),
        ctx,
      );

      const startArgs = (ctx.colonizationService!.startProcess as any).mock.calls[0];
      expect(startArgs[4]).toBe(true); // outpostEstablished
    });

    it('passes outpostEstablished=false to startProcess when cargo below thresholds', async () => {
      const ctx = makeCtx();
      const handler = new ColonizeHandler();
      await handler.processArrival(
        makeFleetEvent({
          mineraiCargo: '100',
          siliciumCargo: '50',
          hydrogeneCargo: '0',
        }),
        ctx,
      );

      const startArgs = (ctx.colonizationService!.startProcess as any).mock.calls[0];
      expect(startArgs[4]).toBe(false);
    });

    it('throws if originPlanetId is null (cannot start process)', async () => {
      const handler = new ColonizeHandler();
      await expect(
        handler.processArrival(makeFleetEvent({ originPlanetId: null }), makeCtx()),
      ).rejects.toThrow(/originPlanetId is null/);
    });

    it('creates failure report when occupied', async () => {
      state.planets.push({
        id: 'existing-planet',
        userId: 'someone-else',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Already There',
      });
      const ctx = makeCtx();
      const handler = new ColonizeHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.title).toContain('Colonisation échouée');
      expect(reportArg.result).toMatchObject({ success: false, reason: 'occupied' });
    });
  });
});

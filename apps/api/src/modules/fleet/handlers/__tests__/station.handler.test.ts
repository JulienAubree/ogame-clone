import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets', id: { __c: 'id' }, userId: { __c: 'userId' }, galaxy: { __c: 'galaxy' }, system: { __c: 'system' }, position: { __c: 'position' }, name: { __c: 'name' }, minerai: { __c: 'minerai' }, silicium: { __c: 'silicium' }, hydrogene: { __c: 'hydrogene' } },
  planetShips: { __t: 'planetShips', planetId: { __c: 'planetId' }, transporterMedium: { __c: 'transporterMedium' }, lightFighter: { __c: 'lightFighter' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: 'sql', strings: Array.from(strings), values }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
}));

import { StationHandler } from '../station.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakePlanet {
  id: string;
  userId: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  minerai: string;
  silicium: string;
  hydrogene: string;
}

interface FakeState {
  planets: FakePlanet[];
  // For validateFleet, two queries are issued. We keep distinct lookup results:
  validateTargetResult: Array<{ userId: string }> | null;
  validateOriginResult: Array<{ userId: string }> | null;
  validateSelectCallCount: number;
  planetUpdates: Array<{ id: string; minerai: string; silicium: string; hydrogene: string }>;
  shipUpdates: Array<{ planetId: string; values: Record<string, unknown> }>;
}

let state: FakeState;

function tableOf(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  return (token as { __t?: string }).__t ?? null;
}

function buildSelectChain() {
  const ctx: { table: string | null } = { table: null };
  const chain: any = {
    from(table: unknown) { ctx.table = tableOf(table); return chain; },
    where() { return chain; },
    limit() { return chain; },
    then(resolve: (v: unknown[]) => void) {
      if (ctx.table === 'planets') {
        // For validateFleet, distinguish by call count (target then origin)
        if (state.validateTargetResult !== null || state.validateOriginResult !== null) {
          state.validateSelectCallCount += 1;
          if (state.validateSelectCallCount === 1) {
            resolve(state.validateTargetResult ?? []);
            return;
          }
          if (state.validateSelectCallCount === 2) {
            resolve(state.validateOriginResult ?? []);
            return;
          }
        }
        resolve(state.planets.map(p => ({ ...p })));
        return;
      }
      resolve([]);
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
        for (const planet of state.planets) {
          state.planetUpdates.push({
            id: planet.id,
            minerai: pendingValues.minerai as string,
            silicium: pendingValues.silicium as string,
            hydrogene: pendingValues.hydrogene as string,
          });
          planet.minerai = pendingValues.minerai as string;
          planet.silicium = pendingValues.silicium as string;
          planet.hydrogene = pendingValues.hydrogene as string;
        }
      } else if (marker === 'planetShips') {
        state.shipUpdates.push({ planetId: state.planets[0]?.id ?? '', values: pendingValues });
      }
      return Promise.resolve();
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  update: vi.fn((t: unknown) => buildUpdateChain(t)),
};

function makeFleetEvent(overrides: Partial<FleetEvent> = {}): FleetEvent {
  return {
    id: 'fe-1',
    userId: 'user-1',
    originPlanetId: 'planet-origin',
    targetPlanetId: 'planet-target',
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'station',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '500',
    siliciumCargo: '300',
    hydrogeneCargo: '100',
    ships: { transporterMedium: 5, lightFighter: 3 },
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
          transporterMedium: { baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 200, driveType: 'fusion' },
          lightFighter: { baseSpeed: 12, fuelConsumption: 1, cargoCapacity: 50, driveType: 'fusion' },
        },
      }),
    } as any,
    reportService: {
      create: vi.fn().mockResolvedValue({ id: 'report-1' }),
    } as any,
    fleetQueue: {} as any,
    assetsDir: '/tmp',
    resourceService: {} as any,
    ...overrides,
  } as MissionHandlerContext;
}

describe('StationHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      validateTargetResult: null,
      validateOriginResult: null,
      validateSelectCallCount: 0,
      planetUpdates: [],
      shipUpdates: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when target planet belongs to another user', async () => {
      state.validateTargetResult = [{ userId: 'user-other' }];
      state.validateOriginResult = [{ userId: 'user-1' }];

      const handler = new StationHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'planet-origin', targetGalaxy: 1, targetSystem: 10, targetPosition: 5, mission: 'station', ships: { transporterMedium: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/propres/);
    });

    it('does NOT throw when target and origin belong to the same user', async () => {
      state.validateTargetResult = [{ userId: 'user-1' }];
      state.validateOriginResult = [{ userId: 'user-1' }];

      const handler = new StationHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'planet-origin', targetGalaxy: 1, targetSystem: 10, targetPosition: 5, mission: 'station', ships: { transporterMedium: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).resolves.toBeUndefined();
    });

    it('throws when target planet does not exist', async () => {
      state.validateTargetResult = [];
      state.validateOriginResult = [{ userId: 'user-1' }];

      const handler = new StationHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'planet-origin', targetGalaxy: 1, targetSystem: 10, targetPosition: 5, mission: 'station', ships: { transporterMedium: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow();
    });
  });

  describe('processArrival', () => {
    it('aborts with cargo refund when target planet does not exist', async () => {
      const handler = new StationHandler();
      // state.planets stays empty
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(state.planetUpdates).toHaveLength(0);
      expect(state.shipUpdates).toHaveLength(0);
    });

    it('creates a failure report when target does not exist', async () => {
      const ctx = makeCtx();
      const handler = new StationHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('station');
      expect(reportArg.title).toContain('Stationnement échoué');
      expect(reportArg.result).toEqual({ aborted: true, reason: 'no_planet' });
    });

    it('deposits cargo + transfers ships and returns scheduleReturn=false when target exists', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      const handler = new StationHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      expect(result.cargo).toBeUndefined();
      expect(state.planetUpdates).toHaveLength(1);
      expect(state.planetUpdates[0]).toEqual({
        id: 'planet-target',
        minerai: '1500', // 1000 + 500
        silicium: '800', // 500 + 300
        hydrogene: '300', // 200 + 100
      });
      // Ships transferred via update of planetShips
      expect(state.shipUpdates).toHaveLength(1);
      expect(state.shipUpdates[0].values).toHaveProperty('transporterMedium');
      expect(state.shipUpdates[0].values).toHaveProperty('lightFighter');
    });

    it('skips flagship when transferring ships', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const handler = new StationHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { transporterMedium: 5, flagship: 1 } }),
        makeCtx(),
      );

      expect(state.shipUpdates).toHaveLength(1);
      expect(state.shipUpdates[0].values).toHaveProperty('transporterMedium');
      expect(state.shipUpdates[0].values).not.toHaveProperty('flagship');
    });

    it('does not call update on planetShips when only flagship is in fleet', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const handler = new StationHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { flagship: 1 } }),
        makeCtx(),
      );

      // Planet update happens (cargo deposit, even if 0), but no ship update
      expect(state.shipUpdates).toHaveLength(0);
    });

    it('creates a success report referencing the stationed ships', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const ctx = makeCtx();
      const handler = new StationHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('station');
      expect(reportArg.title).toContain('Flotte stationnée');
      expect(reportArg.result.deposited).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(reportArg.result.stationed).toEqual({ transporterMedium: 5, lightFighter: 3 });
      expect(result.reportId).toBe('report-1');
    });
  });
});

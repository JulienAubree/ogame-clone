import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets', id: { __c: 'id' } },
  planetShips: {
    __t: 'planetShips',
    planetId: { __c: 'planetId' },
    transporterMedium: { __c: 'transporterMedium' },
    lightFighter: { __c: 'lightFighter' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: 'sql', strings: Array.from(strings), values }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
}));

import { AbandonReturnHandler } from '../abandon-return.handler.js';
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
  planetUpdates: Array<{ id: string; minerai: string; silicium: string; hydrogene: string }>;
  shipInserts: Array<{ values: Record<string, unknown>; conflictSet: Record<string, unknown> }>;
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
        resolve(state.planets.map(p => ({ ...p })));
      } else {
        resolve([]);
      }
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
      }
      return Promise.resolve();
    },
  };
  return chain;
}

function buildInsertChain(table: unknown) {
  const marker = tableOf(table);
  let insertValues: Record<string, unknown> = {};
  const chain: any = {
    values(values: Record<string, unknown>) { insertValues = values; return chain; },
    onConflictDoUpdate(opts: { target: unknown; set: Record<string, unknown> }) {
      if (marker === 'planetShips') {
        state.shipInserts.push({ values: insertValues, conflictSet: opts.set });
      }
      return Promise.resolve();
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  update: vi.fn((t: unknown) => buildUpdateChain(t)),
  insert: vi.fn((t: unknown) => buildInsertChain(t)),
};

function makeFleetEvent(overrides: Partial<FleetEvent> = {}): FleetEvent {
  return {
    id: 'fe-1',
    userId: 'user-1',
    originPlanetId: null,
    targetPlanetId: 'planet-target',
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'abandon_return',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '500',
    siliciumCargo: '300',
    hydrogeneCargo: '100',
    ships: { transporterMedium: 5, lightFighter: 3 },
    metadata: {
      abandonedPlanet: { name: 'Lost Colony', galaxy: 2, system: 20, position: 8 },
    },
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

describe('AbandonReturnHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      planetUpdates: [],
      shipInserts: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('never throws — abandon_return is internal-only with no validation', async () => {
      const handler = new AbandonReturnHandler();
      await expect(handler.validateFleet({} as any, {} as any, {} as any)).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('reports ships+cargo lost when destination planet is gone', async () => {
      // state.planets stays empty
      const ctx = makeCtx();
      const handler = new AbandonReturnHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(result.scheduleReturn).toBe(false);
      expect(state.planetUpdates).toHaveLength(0);
      expect(state.shipInserts).toHaveLength(0);

      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('abandon_return');
      expect(reportArg.title).toContain('échoué');
      expect(reportArg.result.aborted).toBe(true);
      expect(reportArg.result.reason).toBe('no_destination');
      expect(reportArg.result.shipsLost).toEqual({ transporterMedium: 5, lightFighter: 3 });
      expect(reportArg.result.cargoLost).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
    });

    it('deposits cargo on destination when target exists', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });

      const handler = new AbandonReturnHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      expect(state.planetUpdates).toHaveLength(1);
      expect(state.planetUpdates[0]).toEqual({
        id: 'planet-target',
        minerai: '1500',
        silicium: '800',
        hydrogene: '300',
      });
    });

    it('merges ships into destination planet_ships (insert with onConflictDoUpdate)', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const handler = new AbandonReturnHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(state.shipInserts).toHaveLength(1);
      expect(state.shipInserts[0].values).toMatchObject({
        planetId: 'planet-target',
        transporterMedium: 5,
        lightFighter: 3,
      });
      expect(state.shipInserts[0].conflictSet).toHaveProperty('transporterMedium');
      expect(state.shipInserts[0].conflictSet).toHaveProperty('lightFighter');
    });

    it('skips flagship when merging ships', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const handler = new AbandonReturnHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { transporterMedium: 5, flagship: 1 } }),
        makeCtx({
          flagshipService: { returnFromMission: vi.fn().mockResolvedValue(undefined) } as any,
        }),
      );

      expect(state.shipInserts).toHaveLength(1);
      expect(state.shipInserts[0].values).not.toHaveProperty('flagship');
      expect(state.shipInserts[0].conflictSet).not.toHaveProperty('flagship');
    });

    it('does NOT insert into planetShips when only flagship in fleet', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const handler = new AbandonReturnHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { flagship: 1 } }),
        makeCtx({
          flagshipService: { returnFromMission: vi.fn().mockResolvedValue(undefined) } as any,
        }),
      );

      expect(state.shipInserts).toHaveLength(0);
    });

    it('calls flagshipService.returnFromMission when flagship in fleet', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const flagshipService = { returnFromMission: vi.fn().mockResolvedValue(undefined) };
      const handler = new AbandonReturnHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { transporterMedium: 5, flagship: 1 } }),
        makeCtx({ flagshipService: flagshipService as any }),
      );

      expect(flagshipService.returnFromMission).toHaveBeenCalledWith('user-1', 'planet-target');
    });

    it('does NOT call flagshipService.returnFromMission when no flagship in fleet', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const flagshipService = { returnFromMission: vi.fn().mockResolvedValue(undefined) };
      const handler = new AbandonReturnHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx({ flagshipService: flagshipService as any }));

      expect(flagshipService.returnFromMission).not.toHaveBeenCalled();
    });

    it('creates a success report on successful arrival', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Foo',
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const ctx = makeCtx();
      const handler = new AbandonReturnHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('abandon_return');
      expect(reportArg.title).toContain('Lost Colony');
      expect(reportArg.result.destination.id).toBe('planet-target');
      expect(reportArg.result.delivered.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(result.reportId).toBe('report-1');
    });
  });
});

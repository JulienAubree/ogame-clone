import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  debrisFields: {
    __t: 'debrisFields',
    galaxy: { __c: 'galaxy' },
    system: { __c: 'system' },
    position: { __c: 'position' },
    id: { __c: 'id' },
  },
  planets: {
    __t: 'planets',
    id: { __c: 'id' },
    galaxy: { __c: 'galaxy' },
    system: { __c: 'system' },
    position: { __c: 'position' },
    name: { __c: 'name' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn((ships: Record<string, number>) => {
    let total = 0;
    for (const count of Object.values(ships)) total += (count as number) * 100;
    return total;
  }),
}));

import { RecycleHandler } from '../recycle.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakeDebris {
  id: string;
  galaxy: number;
  system: number;
  position: number;
  minerai: string;
  silicium: string;
}

interface FakePlanet {
  id: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
}

interface FakeState {
  debrisFields: FakeDebris[];
  planets: FakePlanet[];
  debrisUpdates: Array<{ id: string; minerai: string; silicium: string }>;
  debrisDeletes: string[];
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
      if (ctx.table === 'debrisFields') {
        resolve(state.debrisFields.map(d => ({ ...d })));
      } else if (ctx.table === 'planets') {
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
      if (marker === 'debrisFields') {
        for (const d of state.debrisFields) {
          state.debrisUpdates.push({
            id: d.id,
            minerai: pendingValues.minerai as string,
            silicium: pendingValues.silicium as string,
          });
          d.minerai = pendingValues.minerai as string;
          d.silicium = pendingValues.silicium as string;
        }
      }
      return Promise.resolve();
    },
  };
  return chain;
}

function buildDeleteChain(table: unknown) {
  const marker = tableOf(table);
  const chain: any = {
    where() {
      if (marker === 'debrisFields') {
        for (const d of state.debrisFields) state.debrisDeletes.push(d.id);
        state.debrisFields = [];
      }
      return Promise.resolve();
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  update: vi.fn((t: unknown) => buildUpdateChain(t)),
  delete: vi.fn((t: unknown) => buildDeleteChain(t)),
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
    mission: 'recycle',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { recycler: 5 },
    metadata: null,
    pveMissionId: null,
    tradeId: null,
    ...overrides,
  };
}

function makeConfig(): any {
  return {
    ships: {
      recycler: { id: 'recycler', role: 'recycling', baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 100, driveType: 'fusion', miningExtraction: 0 },
      lightFighter: { id: 'lightFighter', role: 'combat', baseSpeed: 12, fuelConsumption: 1, cargoCapacity: 50, driveType: 'fusion', miningExtraction: 0 },
    },
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue(makeConfig()),
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

describe('RecycleHandler', () => {
  beforeEach(() => {
    state = {
      debrisFields: [],
      planets: [],
      debrisUpdates: [],
      debrisDeletes: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when fleet contains a non-recycler ship', async () => {
      const handler = new RecycleHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'recycle',
        ships: { recycler: 1, lightFighter: 1 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).rejects.toThrow(/recycleurs/);
    });

    it('allows fleet of recyclers only', async () => {
      const handler = new RecycleHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'recycle',
        ships: { recycler: 5 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).resolves.toBeUndefined();
    });

    it('allows flagship in the recycling fleet', async () => {
      const handler = new RecycleHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'recycle',
        ships: { recycler: 1, flagship: 1 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('aborts with cargo refund when no debris field exists at target', async () => {
      const handler = new RecycleHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '50', siliciumCargo: '20', hydrogeneCargo: '10' }),
        makeCtx(),
      );

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 50, silicium: 20, hydrogene: 10 });
      expect(state.debrisUpdates).toHaveLength(0);
      expect(state.debrisDeletes).toHaveLength(0);
    });

    it('aborts with cargo refund when debris is empty (minerai+silicium <= 0)', async () => {
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '0', silicium: '0',
      });
      const handler = new RecycleHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '5', siliciumCargo: '5', hydrogeneCargo: '0' }),
        makeCtx(),
      );

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 5, silicium: 5, hydrogene: 0 });
      expect(state.debrisUpdates).toHaveLength(0);
      expect(state.debrisDeletes).toHaveLength(0);
    });

    it('creates an "empty" report when no debris field exists', async () => {
      const ctx = makeCtx();
      const handler = new RecycleHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('recycle');
      expect(reportArg.title).toContain('Rien trouvé');
      expect((reportArg.result as any).empty).toBe(true);
    });

    it('collects up to cargo capacity and deletes debris when fully extracted', async () => {
      // Cargo capacity = 5 recyclers * 100 = 500
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '200', silicium: '100',
      });
      const handler = new RecycleHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      // collected 200 + 100 = 300, debris empty → delete
      expect(state.debrisDeletes).toContain('debris-1');
      expect(state.debrisUpdates).toHaveLength(0);
      expect(result.cargo).toEqual({ minerai: 200, silicium: 100, hydrogene: 0 });
    });

    it('collects partial debris and updates remaining when cargo full', async () => {
      // Cargo capacity = 5 * 100 = 500. Debris has 600 minerai + 400 silicium.
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '600', silicium: '400',
      });
      const handler = new RecycleHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      // Extracts 500 minerai first (cargo full), 0 silicium
      expect(state.debrisUpdates).toHaveLength(1);
      expect(state.debrisUpdates[0]).toEqual({
        id: 'debris-1',
        minerai: '100', // 600 - 500
        silicium: '400', // 400 - 0
      });
      expect(state.debrisDeletes).toHaveLength(0);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 0, hydrogene: 0 });
    });

    it('returns combined cargo (original + collected) on success', async () => {
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '50', silicium: '30',
      });
      const handler = new RecycleHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '10', siliciumCargo: '20', hydrogeneCargo: '5' }),
        makeCtx(),
      );

      expect(result.cargo).toEqual({
        minerai: 60,   // 10 original + 50 collected
        silicium: 50,  // 20 original + 30 collected
        hydrogene: 5,  // unchanged
      });
    });

    it('calls exiliumService.tryDrop on successful recycling', async () => {
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '50', silicium: '30',
      });
      const exiliumService = {
        tryDrop: vi.fn().mockResolvedValue(undefined),
      };
      const ctx = makeCtx({ exiliumService: exiliumService as any });
      const handler = new RecycleHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(exiliumService.tryDrop).toHaveBeenCalledWith(
        'user-1',
        'recycling',
        expect.objectContaining({ fleetEventId: 'fe-1' }),
      );
    });

    it('does not call exiliumService.tryDrop when debris is empty', async () => {
      const exiliumService = {
        tryDrop: vi.fn().mockResolvedValue(undefined),
      };
      const ctx = makeCtx({ exiliumService: exiliumService as any });
      const handler = new RecycleHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(exiliumService.tryDrop).not.toHaveBeenCalled();
    });

    it('creates a success report with collected resources', async () => {
      state.debrisFields.push({
        id: 'debris-1', galaxy: 1, system: 10, position: 5, minerai: '200', silicium: '100',
      });
      const ctx = makeCtx();
      const handler = new RecycleHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('recycle');
      expect(reportArg.title).toContain('Rapport de recyclage');
      expect((reportArg.result as any).collected).toEqual({ minerai: 200, silicium: 100 });
      expect((reportArg.result as any).debrisRemaining).toBeNull();
      expect(result.reportId).toBe('report-1');
    });
  });
});

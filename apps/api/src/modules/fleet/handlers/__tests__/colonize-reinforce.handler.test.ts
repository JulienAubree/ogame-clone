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
    status: { __c: 'planets.status' },
  },
  planetShips: {
    __t: 'planetShips',
    planetId: { __c: 'planetShips.planetId' },
    cruiser: { __c: 'planetShips.cruiser' },
    transporterMedium: { __c: 'planetShips.transporterMedium' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __op: 'sql', strings, values }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
}));

import { ColonizeReinforceHandler } from '../colonize-reinforce.handler.js';
import type { MissionHandlerContext, FleetEvent, SendFleetInput } from '../../fleet.types.js';
import { TRPCError } from '@trpc/server';

interface FakePlanet {
  id: string;
  userId: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  status: string;
  minerai?: string;
  silicium?: string;
  hydrogene?: string;
}

interface FakeState {
  planets: FakePlanet[];
  planetUpdates: Array<{ id: string; values: Record<string, unknown> }>;
  planetShipsUpdates: Array<Record<string, unknown>>;
}

let state: FakeState;

function tableOf(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  return (token as { __t?: string }).__t ?? null;
}

function buildSelectChain() {
  const ctx: { table: string | null; whereJson: string } = { table: null, whereJson: '' };
  const chain: any = {
    from(table: unknown) { ctx.table = tableOf(table); return chain; },
    where(cond: unknown) { ctx.whereJson = JSON.stringify(cond); return chain; },
    limit() { return chain; },
    then(resolve: (v: unknown[]) => void) {
      if (ctx.table === 'planets') {
        // If filtering on status='colonizing', return only colonizing planets
        if (ctx.whereJson.includes('colonizing')) {
          resolve(state.planets.filter(p => p.status === 'colonizing').map(p => ({ ...p })));
          return;
        }
        // origin planet lookup by id
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
        for (const p of state.planets) {
          state.planetUpdates.push({ id: p.id, values: { ...pendingValues } });
          if (typeof pendingValues.minerai === 'string') p.minerai = pendingValues.minerai as string;
          if (typeof pendingValues.silicium === 'string') p.silicium = pendingValues.silicium as string;
          if (typeof pendingValues.hydrogene === 'string') p.hydrogene = pendingValues.hydrogene as string;
        }
      } else if (marker === 'planetShips') {
        state.planetShipsUpdates.push({ ...pendingValues });
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
    targetPlanetId: null,
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'colonize_reinforce',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '500',
    siliciumCargo: '300',
    hydrogeneCargo: '100',
    ships: { cruiser: 5 },
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
          cruiser: { baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 100, driveType: 'fusion' },
        },
      }),
    } as any,
    reportService: {
      create: vi.fn().mockResolvedValue({ id: 'report-1' }),
    } as any,
    colonizationService: {
      updateLastConvoySupplyAt: vi.fn().mockResolvedValue(undefined),
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
    mission: 'colonize_reinforce',
    ships: { cruiser: 5 },
    ...overrides,
  };
}

describe('ColonizeReinforceHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      planetUpdates: [],
      planetShipsUpdates: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws if no ships are sent', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
      });
      const handler = new ColonizeReinforceHandler();
      const input = makeInput({ ships: {} });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).rejects.toThrow(TRPCError);
    });

    it('throws if no colonizing planet at coordinates', async () => {
      // No planets in state
      const handler = new ColonizeReinforceHandler();
      await expect(handler.validateFleet(makeInput(), {} as any, makeCtx())).rejects.toThrow(TRPCError);
    });

    it('allows valid case with ships and a colonizing planet', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
      });
      const handler = new ColonizeReinforceHandler();
      await expect(handler.validateFleet(makeInput(), {} as any, makeCtx())).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('aborts with refund when target planet is no longer colonizing', async () => {
      // No colonizing planet in state
      const handler = new ColonizeReinforceHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      // No deposits performed
      expect(state.planetUpdates).toHaveLength(0);
    });

    it('creates a failure report when target planet not colonizing', async () => {
      const ctx = makeCtx();
      const handler = new ColonizeReinforceHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('colonize_reinforce');
      expect(reportArg.title).toContain('Renforcement echoue');
      expect(reportArg.result).toEqual({ aborted: true, reason: 'no_colonizing_planet' });
    });

    it('on success: deposits cargo into the colonizing planet', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '1000',
        silicium: '500',
        hydrogene: '200',
      });
      const handler = new ColonizeReinforceHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false); // ships stay, no return trip
      // Deposit update
      const cargoUpdate = state.planetUpdates.find(u => u.values.minerai !== undefined);
      expect(cargoUpdate).toBeDefined();
      expect(cargoUpdate!.values).toEqual({
        minerai: '1500',  // 1000 + 500
        silicium: '800',  // 500 + 300
        hydrogene: '300', // 200 + 100
      });
    });

    it('on success: stations ships into planetShips', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const handler = new ColonizeReinforceHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { cruiser: 3, transporterMedium: 2 } }),
        makeCtx(),
      );

      expect(state.planetShipsUpdates).toHaveLength(1);
      // The shipUpdates use sql template — we just check both ship keys are present
      const update = state.planetShipsUpdates[0];
      expect(Object.keys(update)).toEqual(expect.arrayContaining(['cruiser', 'transporterMedium']));
    });

    it('skips planetShips update when no ships (only flagship)', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const handler = new ColonizeReinforceHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { flagship: 1 } }),
        makeCtx(),
      );

      // Flagship should be excluded, so no planetShips update
      expect(state.planetShipsUpdates).toHaveLength(0);
    });

    it('triggers convoy bonus when cargo is delivered', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const ctx = makeCtx();
      const handler = new ColonizeReinforceHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.colonizationService!.updateLastConvoySupplyAt).toHaveBeenCalledWith('colonizing-1');
    });

    it('does NOT trigger convoy bonus when cargo is empty', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const ctx = makeCtx();
      const handler = new ColonizeReinforceHandler();
      await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '0', siliciumCargo: '0', hydrogeneCargo: '0' }),
        ctx,
      );

      expect(ctx.colonizationService!.updateLastConvoySupplyAt).not.toHaveBeenCalled();
    });

    it('creates a success mission report with stationed ships and deposited resources', async () => {
      state.planets.push({
        id: 'colonizing-1',
        userId: 'user-1',
        galaxy: 1,
        system: 10,
        position: 5,
        name: 'Colony',
        status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const ctx = makeCtx();
      const handler = new ColonizeReinforceHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('colonize_reinforce');
      expect(reportArg.title).toContain('Renforcement du secteur');
      expect(reportArg.result).toMatchObject({
        stationed: { cruiser: 5 },
        deposited: { minerai: 500, silicium: 300, hydrogene: 100 },
      });
      expect(result.reportId).toBe('report-1');
    });
  });
});

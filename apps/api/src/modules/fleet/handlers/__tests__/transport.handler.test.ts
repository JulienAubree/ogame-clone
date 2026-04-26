import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets' },
  colonizationProcesses: { __t: 'colonizationProcesses' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
}));

import { TransportHandler } from '../transport.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakePlanet {
  id: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  status: string;
  minerai: string;
  silicium: string;
  hydrogene: string;
}

interface FakeColonizationProcess {
  id: string;
  outpostEstablished: boolean;
}

interface FakeState {
  planets: FakePlanet[];
  colonizationProcesses: FakeColonizationProcess[];
  outpostEstablishedUpdates: number;
  planetUpdates: Array<{ id: string; minerai: string; silicium: string; hydrogene: string }>;
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
      } else if (ctx.table === 'colonizationProcesses') {
        resolve(state.colonizationProcesses.map(p => ({ ...p })));
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
      } else if (marker === 'colonizationProcesses') {
        if (pendingValues.outpostEstablished === true) {
          state.outpostEstablishedUpdates += 1;
          for (const p of state.colonizationProcesses) p.outpostEstablished = true;
        }
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
    mission: 'transport',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '500',
    siliciumCargo: '300',
    hydrogeneCargo: '100',
    ships: { transporterMedium: 5 },
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
        ships: { transporterMedium: { baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 200, driveType: 'fusion' } },
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

describe('TransportHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      colonizationProcesses: [],
      outpostEstablishedUpdates: 0,
      planetUpdates: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('does not throw — transport has no validation', async () => {
      const handler = new TransportHandler();
      await expect(handler.validateFleet({} as any, {} as any, {} as any)).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('aborts with cargo refund when target planet does not exist', async () => {
      const handler = new TransportHandler();
      // state.planets stays empty
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
      expect(state.planetUpdates).toHaveLength(0);
    });

    it('deposits cargo and returns empty cargo when target exists', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'active', minerai: '1000', silicium: '500', hydrogene: '200',
      });
      const handler = new TransportHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
      expect(state.planetUpdates).toHaveLength(1);
      expect(state.planetUpdates[0]).toEqual({
        id: 'planet-target',
        minerai: '1500', // 1000 + 500
        silicium: '800', // 500 + 300
        hydrogene: '300', // 200 + 100
      });
    });

    it('creates a transport report on success', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'active', minerai: '0', silicium: '0', hydrogene: '0',
      });
      const ctx = makeCtx();
      const handler = new TransportHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('transport');
      expect(reportArg.title).toContain('Transport effectué');
      expect(reportArg.result).toEqual({ delivered: { minerai: 500, silicium: 300, hydrogene: 100 } });
      expect(result.reportId).toBe('report-1');
    });

    it('creates a failure report when target does not exist', async () => {
      const ctx = makeCtx();
      const handler = new TransportHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.title).toContain('Transport échoué');
      expect(reportArg.result).toEqual({ aborted: true, reason: 'no_planet' });
    });

    it('marks outpost established when colonizing planet receives threshold-meeting cargo', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'colonizing', minerai: '0', silicium: '0', hydrogene: '0',
      });
      state.colonizationProcesses.push({ id: 'proc-1', outpostEstablished: false });

      const colonizationService = {
        getProcess: vi.fn().mockResolvedValue({ id: 'proc-1', outpostEstablished: false }),
        getOutpostThresholds: vi.fn().mockResolvedValue({ minerai: 400, silicium: 200 }),
        updateLastConvoySupplyAt: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new TransportHandler();
      // Cargo: 500 minerai, 300 silicium → meets 400/200 threshold
      await handler.processArrival(makeFleetEvent(), makeCtx({ colonizationService: colonizationService as any }));

      expect(state.outpostEstablishedUpdates).toBe(1);
      expect(colonizationService.updateLastConvoySupplyAt).toHaveBeenCalledWith('planet-target');
    });

    it('does NOT mark outpost when threshold not met', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'colonizing', minerai: '0', silicium: '0', hydrogene: '0',
      });
      state.colonizationProcesses.push({ id: 'proc-1', outpostEstablished: false });

      const colonizationService = {
        getProcess: vi.fn().mockResolvedValue({ id: 'proc-1', outpostEstablished: false }),
        getOutpostThresholds: vi.fn().mockResolvedValue({ minerai: 10000, silicium: 5000 }),
        updateLastConvoySupplyAt: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new TransportHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx({ colonizationService: colonizationService as any }));

      expect(state.outpostEstablishedUpdates).toBe(0);
    });

    it('triggers convoy bonus on any cargo delivery to colonizing planet', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'colonizing', minerai: '0', silicium: '0', hydrogene: '0',
      });
      state.colonizationProcesses.push({ id: 'proc-1', outpostEstablished: true });

      const colonizationService = {
        getProcess: vi.fn().mockResolvedValue({ id: 'proc-1', outpostEstablished: true }),
        getOutpostThresholds: vi.fn(),
        updateLastConvoySupplyAt: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new TransportHandler();
      await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '50', siliciumCargo: '0', hydrogeneCargo: '0' }),
        makeCtx({ colonizationService: colonizationService as any }),
      );

      expect(colonizationService.updateLastConvoySupplyAt).toHaveBeenCalledTimes(1);
    });

    it('skips convoy bonus when cargo is empty', async () => {
      state.planets.push({
        id: 'planet-target', galaxy: 1, system: 10, position: 5, name: 'Foo',
        status: 'colonizing', minerai: '0', silicium: '0', hydrogene: '0',
      });
      state.colonizationProcesses.push({ id: 'proc-1', outpostEstablished: true });

      const colonizationService = {
        getProcess: vi.fn().mockResolvedValue({ id: 'proc-1', outpostEstablished: true }),
        getOutpostThresholds: vi.fn(),
        updateLastConvoySupplyAt: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new TransportHandler();
      await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '0', siliciumCargo: '0', hydrogeneCargo: '0' }),
        makeCtx({ colonizationService: colonizationService as any }),
      );

      expect(colonizationService.updateLastConvoySupplyAt).not.toHaveBeenCalled();
    });
  });
});

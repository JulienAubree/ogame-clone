import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  fleetEvents: { __t: 'fleetEvents' },
  pveMissions: { __t: 'pveMissions' },
  asteroidDeposits: { __t: 'asteroidDeposits' },
  userResearch: { __t: 'userResearch' },
  planets: { __t: 'planets' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
}));

vi.mock('@exilium/game-engine', () => ({
  prospectionDuration: vi.fn(() => 30), // 30 minutes
  miningDuration: vi.fn(() => 60), // 60 minutes
  totalCargoCapacity: vi.fn(() => 1000),
  totalMiningExtraction: vi.fn(() => 100),
  resolveBonus: vi.fn(() => 1.5),
  computeSlagRate: vi.fn(() => 0.5),
  computeMiningExtraction: vi.fn(() => ({
    depositLoss: { minerai: 200, silicium: 100, hydrogene: 50 },
    playerReceives: { minerai: 100, silicium: 50, hydrogene: 25 },
  })),
}));


import { MineHandler } from '../mine.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';
import { TRPCError } from '@trpc/server';

interface FakePveMission {
  id: string;
  parameters: { depositId: string };
}

interface FakeDeposit {
  id: string;
  mineraiTotal: string;
  siliciumTotal: string;
  hydrogeneTotal: string;
  mineraiRemaining: string;
  siliciumRemaining: string;
  hydrogeneRemaining: string;
}

interface FakeUserResearch {
  userId: string;
  deepSpaceRefining: number;
}

interface FakeState {
  pveMissions: FakePveMission[];
  asteroidDeposits: FakeDeposit[];
  userResearch: FakeUserResearch[];
  planets: Array<{ id: string; galaxy: number; system: number; position: number; name: string }>;
  fleetEventUpdates: Array<Record<string, unknown>>;
}

let state: FakeState;

function tableOf(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  return (token as { __t?: string }).__t ?? null;
}

function buildSelectChain() {
  const ctx: { table: string | null } = { table: null };
  const results = (): unknown[] => {
    if (ctx.table === 'pveMissions') return state.pveMissions.map(m => ({ ...m }));
    if (ctx.table === 'asteroidDeposits') return state.asteroidDeposits.map(d => ({ ...d }));
    if (ctx.table === 'userResearch') return state.userResearch.map(r => ({ ...r }));
    if (ctx.table === 'planets') return state.planets.map(p => ({ ...p }));
    return [];
  };
  const chain: any = {
    from(table: unknown) { ctx.table = tableOf(table); return chain; },
    where() { return chain; },
    limit() { return chain; },
    then(onResolve: (v: unknown[]) => unknown, onReject?: (e: unknown) => unknown) {
      return Promise.resolve(results()).then(onResolve, onReject);
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
      if (marker === 'fleetEvents') {
        state.fleetEventUpdates.push({ ...pendingValues });
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
    targetPosition: 8,
    mission: 'mine',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { miner: 5 },
    metadata: null,
    pveMissionId: 'mission-1',
    tradeId: null,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue({
        ships: { miner: { id: 'miner', role: 'mining', baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 200, driveType: 'fusion' } },
        universe: { slag_rate: 0.5, belt_positions: [8, 16] },
        bonuses: [],
      }),
    } as any,
    pveService: {
      completeMission: vi.fn().mockResolvedValue(undefined),
    } as any,
    asteroidBeltService: {
      extractFromDeposit: vi.fn().mockResolvedValue({ minerai: 200, silicium: 100, hydrogene: 50 }),
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

describe('MineHandler', () => {
  beforeEach(() => {
    state = {
      pveMissions: [],
      asteroidDeposits: [],
      userResearch: [],
      planets: [],
      fleetEventUpdates: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when no mining ships and no flagship', async () => {
      const handler = new MineHandler();
      const ctx = makeCtx();
      await expect(handler.validateFleet(
        { userId: 'u1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 8, mission: 'mine', ships: {} },
        await ctx.gameConfigService.getFullConfig(),
        ctx,
      )).rejects.toThrow(TRPCError);
    });

    it('throws when target position is not a belt position', async () => {
      const handler = new MineHandler();
      const ctx = makeCtx();
      await expect(handler.validateFleet(
        { userId: 'u1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 5, mission: 'mine', ships: { miner: 1 } },
        await ctx.gameConfigService.getFullConfig(),
        ctx,
      )).rejects.toThrow(TRPCError);
    });

    it('allows mining ships at belt position 8', async () => {
      const handler = new MineHandler();
      const ctx = makeCtx();
      await expect(handler.validateFleet(
        { userId: 'u1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 8, mission: 'mine', ships: { miner: 1 } },
        await ctx.gameConfigService.getFullConfig(),
        ctx,
      )).resolves.toBeUndefined();
    });

    it('allows flagship-only mining (no miner ship needed)', async () => {
      const handler = new MineHandler();
      const ctx = makeCtx();
      await expect(handler.validateFleet(
        { userId: 'u1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 16, mission: 'mine', ships: { flagship: 1 } },
        await ctx.gameConfigService.getFullConfig(),
        ctx,
      )).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('returns scheduleReturn when no pveMissionId', async () => {
      const handler = new MineHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ pveMissionId: null }),
        makeCtx(),
      );
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    });

    it('returns scheduleReturn when mission not found', async () => {
      const handler = new MineHandler();
      // state.pveMissions empty
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());
      expect(result.scheduleReturn).toBe(true);
    });

    it('transitions to prospecting phase with deposit total', async () => {
      state.pveMissions.push({ id: 'mission-1', parameters: { depositId: 'dep-1' } });
      state.asteroidDeposits.push({
        id: 'dep-1',
        mineraiTotal: '1000', siliciumTotal: '500', hydrogeneTotal: '300',
        mineraiRemaining: '1000', siliciumRemaining: '500', hydrogeneRemaining: '300',
      });

      const handler = new MineHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      expect(result.schedulePhase?.jobName).toBe('prospect-done');
      expect(result.schedulePhase?.delayMs).toBeGreaterThan(0);
      // Phase update applied
      expect(state.fleetEventUpdates).toHaveLength(1);
      expect(state.fleetEventUpdates[0].phase).toBe('prospecting');
    });
  });

  describe('processPhase', () => {
    it('throws on unknown phase', async () => {
      const handler = new MineHandler();
      await expect(handler.processPhase('unknown', makeFleetEvent(), makeCtx()))
        .rejects.toThrow(/Unknown mine phase/);
    });

    describe('prospect-done', () => {
      it('returns scheduleReturn when mission missing', async () => {
        const handler = new MineHandler();
        const result = await handler.processPhase('prospect-done', makeFleetEvent(), makeCtx());
        expect(result.scheduleReturn).toBe(true);
      });

      it('transitions to mining phase with mine duration', async () => {
        state.pveMissions.push({ id: 'mission-1', parameters: { depositId: 'dep-1' } });
        state.userResearch.push({ userId: 'user-1', deepSpaceRefining: 0 });

        const handler = new MineHandler();
        const result = await handler.processPhase('prospect-done', makeFleetEvent({ phase: 'prospecting' }), makeCtx());

        expect(result.scheduleNextPhase?.jobName).toBe('mine-done');
        expect(result.scheduleNextPhase?.delayMs).toBeGreaterThan(0);
        expect(state.fleetEventUpdates[0].phase).toBe('mining');
      });
    });

    describe('mine-done', () => {
      it('returns scheduleReturn with empty cargo when mission missing', async () => {
        const handler = new MineHandler();
        const result = await handler.processPhase('mine-done', makeFleetEvent({ phase: 'mining' }), makeCtx());
        expect(result.scheduleReturn).toBe(true);
        expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
      });

      it('extracts from deposit, returns cargo with slag-reduced amounts', async () => {
        state.pveMissions.push({ id: 'mission-1', parameters: { depositId: 'dep-1' } });
        state.userResearch.push({ userId: 'user-1', deepSpaceRefining: 0 });
        state.asteroidDeposits.push({
          id: 'dep-1',
          mineraiTotal: '1000', siliciumTotal: '500', hydrogeneTotal: '300',
          mineraiRemaining: '1000', siliciumRemaining: '500', hydrogeneRemaining: '300',
        });

        const ctx = makeCtx();
        const handler = new MineHandler();
        const result = await handler.processPhase('mine-done', makeFleetEvent({ phase: 'mining' }), ctx);

        expect(result.scheduleReturn).toBe(true);
        // slagRate is 0.5 (mocked) → cargo = floor(actualLoss * 0.5)
        expect(result.cargo).toEqual({ minerai: 100, silicium: 50, hydrogene: 25 });
        // Cargo should be persisted to fleet event
        const cargoUpdate = state.fleetEventUpdates.find(u => 'mineraiCargo' in u);
        expect(cargoUpdate).toBeDefined();
        expect(cargoUpdate!.mineraiCargo).toBe('100');
      });

      it('completes mission only when deposit is fully empty', async () => {
        state.pveMissions.push({ id: 'mission-1', parameters: { depositId: 'dep-1' } });
        state.userResearch.push({ userId: 'user-1', deepSpaceRefining: 0 });
        // Empty deposit
        state.asteroidDeposits.push({
          id: 'dep-1',
          mineraiTotal: '1000', siliciumTotal: '500', hydrogeneTotal: '300',
          mineraiRemaining: '0', siliciumRemaining: '0', hydrogeneRemaining: '0',
        });

        const ctx = makeCtx();
        const handler = new MineHandler();
        await handler.processPhase('mine-done', makeFleetEvent({ phase: 'mining' }), ctx);

        expect(ctx.pveService!.completeMission).toHaveBeenCalledWith('mission-1');
      });

      it('does NOT complete mission when deposit still has resources', async () => {
        state.pveMissions.push({ id: 'mission-1', parameters: { depositId: 'dep-1' } });
        state.userResearch.push({ userId: 'user-1', deepSpaceRefining: 0 });
        state.asteroidDeposits.push({
          id: 'dep-1',
          mineraiTotal: '1000', siliciumTotal: '500', hydrogeneTotal: '300',
          mineraiRemaining: '500', siliciumRemaining: '0', hydrogeneRemaining: '0',
        });

        const ctx = makeCtx();
        const handler = new MineHandler();
        await handler.processPhase('mine-done', makeFleetEvent({ phase: 'mining' }), ctx);

        expect(ctx.pveService!.completeMission).not.toHaveBeenCalled();
      });
    });
  });
});

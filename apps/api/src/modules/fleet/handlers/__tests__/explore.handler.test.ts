import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  fleetEvents: {
    __t: 'fleetEvents',
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
  userResearch: {
    __t: 'userResearch',
    userId: { __c: 'userId' },
  },
  discoveredBiomes: {
    __t: 'discoveredBiomes',
    userId: { __c: 'userId' },
    galaxy: { __c: 'galaxy' },
    system: { __c: 'system' },
    position: { __c: 'position' },
    biomeId: { __c: 'biomeId' },
  },
  discoveredPositions: {
    __t: 'discoveredPositions',
    userId: { __c: 'userId' },
    galaxy: { __c: 'galaxy' },
    system: { __c: 'system' },
    position: { __c: 'position' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
}));

vi.mock('@exilium/game-engine', () => ({
  scanDuration: vi.fn(() => 60), // 60 seconds
  biomeDiscoveryProbability: vi.fn(() => 1), // always discover
  seededRandom: vi.fn(() => () => 0.5),
  coordinateSeed: vi.fn(() => 12345),
  generateBiomeCount: vi.fn(() => 2),
  pickBiomes: vi.fn(() => []),
  pickPlanetTypeForPosition: vi.fn(() => 'rocky'),
  calculateMaxTemp: vi.fn(() => 30),
}));

vi.mock('../../../lib/config-helpers.js', () => ({
  findShipsByRole: vi.fn((config: any, role: string) => {
    return Object.values(config.ships).filter((s: any) => s.role === role);
  }),
}));

import { ExploreHandler } from '../explore.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakeState {
  planets: Array<{ id: string; galaxy: number; system: number; position: number; name: string }>;
  userResearch: Array<{ userId: string; planetaryExploration?: number }>;
  discoveredBiomes: Array<{ userId: string; galaxy: number; system: number; position: number; biomeId: string }>;
  fleetUpdates: Array<{ phase: string; metadata: unknown }>;
  positionInserts: Array<{ userId: string; galaxy: number; system: number; position: number }>;
  biomeInserts: Array<{ userId: string; biomeId: string }>;
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
      } else if (ctx.table === 'userResearch') {
        resolve(state.userResearch.map(r => ({ ...r })));
      } else if (ctx.table === 'discoveredBiomes') {
        resolve(state.discoveredBiomes.map(b => ({ ...b })));
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
      if (marker === 'fleetEvents') {
        state.fleetUpdates.push({
          phase: pendingValues.phase as string,
          metadata: pendingValues.metadata,
        });
      }
      return Promise.resolve();
    },
  };
  return chain;
}

function buildInsertChain(table: unknown) {
  const marker = tableOf(table);
  let pendingValues: any[] = [];
  const chain: any = {
    values(v: any) {
      pendingValues = Array.isArray(v) ? v : [v];
      return chain;
    },
    onConflictDoUpdate() {
      if (marker === 'discoveredPositions') {
        for (const v of pendingValues) {
          state.positionInserts.push({
            userId: v.userId, galaxy: v.galaxy, system: v.system, position: v.position,
          });
        }
      }
      return Promise.resolve();
    },
    onConflictDoNothing() {
      if (marker === 'discoveredBiomes') {
        for (const v of pendingValues) {
          state.biomeInserts.push({ userId: v.userId, biomeId: v.biomeId });
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
  insert: vi.fn((t: unknown) => buildInsertChain(t)),
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
    mission: 'explore',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { explorer: 3 },
    metadata: null,
    pveMissionId: null,
    tradeId: null,
    ...overrides,
  };
}

function makeConfig(extra: Partial<any> = {}): any {
  return {
    ships: {
      explorer: { id: 'explorer', role: 'exploration', baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 50, driveType: 'fusion', miningExtraction: 0 },
      lightFighter: { id: 'lightFighter', role: 'combat', baseSpeed: 12, fuelConsumption: 1, cargoCapacity: 0, driveType: 'fusion', miningExtraction: 0 },
    },
    universe: {
      belt_positions: [8, 16],
    },
    biomes: [],
    ...extra,
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}, configOverride?: any): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue(configOverride ?? makeConfig()),
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

describe('ExploreHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      userResearch: [],
      discoveredBiomes: [],
      fleetUpdates: [],
      positionInserts: [],
      biomeInserts: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when no exploration ships are present', async () => {
      const handler = new ExploreHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'explore',
        ships: { lightFighter: 5 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).rejects.toThrow(/exploration/);
    });

    it('throws when an existing planet is at the target coords', async () => {
      state.planets.push({
        id: 'planet-existing', galaxy: 1, system: 10, position: 5, name: 'Existing',
      });
      const handler = new ExploreHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'explore',
        ships: { explorer: 3 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).rejects.toThrow(/colonisée/);
    });

    it('throws when target is a belt position', async () => {
      const handler = new ExploreHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 8, // belt
        mission: 'explore',
        ships: { explorer: 3 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).rejects.toThrow(/ceinture/);
    });

    it('allows a valid exploration fleet at a non-belt empty position', async () => {
      const handler = new ExploreHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'explore',
        ships: { explorer: 3 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('updates fleet event phase to "exploring" with metadata', async () => {
      state.userResearch.push({ userId: 'user-1', planetaryExploration: 2 });
      const handler = new ExploreHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(state.fleetUpdates).toHaveLength(1);
      expect(state.fleetUpdates[0].phase).toBe('exploring');
      expect(state.fleetUpdates[0].metadata).toEqual({
        explorerCount: 3,
        researchLevel: 2,
      });
    });

    it('returns schedulePhase with scanDuration in ms (60s = 60000ms)', async () => {
      const handler = new ExploreHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      expect(result.schedulePhase).toEqual({
        jobName: 'explore-done',
        delayMs: 60000,
      });
    });

    it('uses researchLevel = 0 when no userResearch row exists', async () => {
      const handler = new ExploreHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect((state.fleetUpdates[0].metadata as any).researchLevel).toBe(0);
    });
  });

  describe('processPhase', () => {
    it('throws on unknown phase', async () => {
      const handler = new ExploreHandler();
      await expect(
        handler.processPhase('something-else', makeFleetEvent(), makeCtx()),
      ).rejects.toThrow(/Unknown explore phase/);
    });

    it('inserts the discovered position regardless of biome outcome', async () => {
      const fleetEvent = makeFleetEvent({
        metadata: { explorerCount: 3, researchLevel: 1 },
      });
      const handler = new ExploreHandler();
      await handler.processPhase('explore-done', fleetEvent, makeCtx());

      expect(state.positionInserts).toHaveLength(1);
      expect(state.positionInserts[0]).toEqual({
        userId: 'user-1', galaxy: 1, system: 10, position: 5,
      });
    });

    it('returns schedule return + empty cargo when biomeCatalogue is empty', async () => {
      const fleetEvent = makeFleetEvent({
        metadata: { explorerCount: 3, researchLevel: 1 },
      });
      const ctx = makeCtx();
      const handler = new ExploreHandler();
      const result = await handler.processPhase('explore-done', fleetEvent, ctx);

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
      expect(result.reportId).toBe('report-1');
      // No biomes were discovered
      expect(state.biomeInserts).toHaveLength(0);
    });

    it('creates a report with "infructueuse" title when no biomes discovered', async () => {
      const fleetEvent = makeFleetEvent({
        metadata: { explorerCount: 3, researchLevel: 1 },
      });
      const ctx = makeCtx();
      const handler = new ExploreHandler();
      await handler.processPhase('explore-done', fleetEvent, ctx);

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('explore');
      expect(reportArg.title).toContain('infructueuse');
      expect((reportArg.result as any).discoveredCount).toBe(0);
    });

    it('uses defaults when fleetEvent.metadata is null', async () => {
      const fleetEvent = makeFleetEvent({ metadata: null });
      const handler = new ExploreHandler();
      const result = await handler.processPhase('explore-done', fleetEvent, makeCtx());

      // Should still complete with empty biomes path
      expect(result.scheduleReturn).toBe(true);
    });
  });
});

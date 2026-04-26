import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets' },
  planetShips: { __t: 'planetShips' },
  colonizationProcesses: { __t: 'colonizationProcesses', id: { __c: 'colonizationProcesses.id' }, progress: { __c: 'colonizationProcesses.progress' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
  sql: () => ({ __op: 'sql' }),
}));

vi.mock('@exilium/game-engine', () => ({
  simulateCombat: vi.fn(),
}));

vi.mock('../../fleet.types.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../fleet.types.js')>();
  return {
    ...actual,
    buildShipCombatConfigs: vi.fn(() => ({})),
    buildShipCosts: vi.fn(() => ({})),
  };
});

vi.mock('../../combat.helpers.js', () => ({
  buildCombatConfig: vi.fn(() => ({})),
  parseUnitRow: vi.fn((row: unknown) => {
    if (!row) return {};
    const fleet: Record<string, number> = {};
    for (const [k, v] of Object.entries(row as Record<string, unknown>)) {
      if (k !== 'planetId' && typeof v === 'number') fleet[k] = v;
    }
    return fleet;
  }),
  applyDefenderLosses: vi.fn().mockResolvedValue(undefined),
  computeBothFP: vi.fn(() => ({ attackerFP: 100, defenderFP: 0 })),
  computeShotsPerRound: vi.fn(() => []),
  buildCombatReportData: vi.fn(() => ({})),
}));

import { ColonizationRaidHandler } from '../colonization-raid.handler.js';
import { simulateCombat } from '@exilium/game-engine';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakePlanet {
  id: string;
  userId: string;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  status: string;
  minerai: string;
  silicium: string;
  hydrogene: string;
}

interface FakeState {
  planets: FakePlanet[];
  planetShips: Array<{ planetId: string; [key: string]: unknown }>;
  planetUpdates: Array<Record<string, unknown>>;
  processProgressUpdates: number;
  processLastRaidUpdates: number;
}

let state: FakeState;

function tableOf(token: unknown): string | null {
  if (!token || typeof token !== 'object') return null;
  return (token as { __t?: string }).__t ?? null;
}

function buildSelectChain() {
  const ctx: { table: string | null } = { table: null };
  const results = (): unknown[] => {
    if (ctx.table === 'planets') return state.planets.map(p => ({ ...p }));
    if (ctx.table === 'planetShips') return state.planetShips.map(p => ({ ...p }));
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
      if (marker === 'planets') {
        state.planetUpdates.push({ ...pendingValues });
      } else if (marker === 'colonizationProcesses') {
        if ('progress' in pendingValues) state.processProgressUpdates += 1;
        if ('lastRaidAt' in pendingValues) state.processLastRaidUpdates += 1;
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
    userId: 'pirate-system',
    originPlanetId: null,
    targetPlanetId: 'planet-target',
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'colonization_raid',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { fighter: 5 },
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
        ships: { fighter: { weapons: 10, shotCount: 1, shield: 5, hull: 20 } },
        defenses: {},
        universe: {
          colonization_raid_base_penalty: 0.1,
          colonization_raid_no_garrison_pillage: 0.5,
          colonization_raid_garrison_pillage: 0.33,
          fp_shotcount_exponent: 1.5,
          fp_divisor: 100,
        },
      }),
    } as any,
    colonizationService: {
      getProcess: vi.fn().mockResolvedValue({ id: 'proc-1', planetId: 'planet-target' }),
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

describe('ColonizationRaidHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      planetShips: [],
      planetUpdates: [],
      processProgressUpdates: 0,
      processLastRaidUpdates: 0,
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('does not throw — auto-generated raids skip validation', async () => {
      const handler = new ColonizationRaidHandler();
      await expect(handler.validateFleet()).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('fizzles silently when target planet no longer colonizing', async () => {
      // state.planets empty → no colonizing planet found
      const handler = new ColonizationRaidHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      expect(result.reportId).toBeUndefined();
      expect(state.planetUpdates).toHaveLength(0);
      expect(state.processProgressUpdates).toBe(0);
    });

    it('applies full pillage + penalty when colonizing planet has no garrison', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      // No planetShips → no garrison

      const handler = new ColonizationRaidHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
      // Pillage = 50% → planet keeps 50%
      expect(state.planetUpdates).toHaveLength(1);
      expect(state.planetUpdates[0].minerai).toBe('500');
      expect(state.planetUpdates[0].silicium).toBe('250');
      expect(state.planetUpdates[0].hydrogene).toBe('100');
      // Progress + lastRaidAt updated
      expect(state.processProgressUpdates).toBe(1);
      expect(state.processLastRaidUpdates).toBe(1);
      // simulateCombat NOT called when no garrison
      expect(simulateCombat).not.toHaveBeenCalled();
    });

    it('creates "Sans defense" report when no garrison', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      const ctx = makeCtx();
      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.userId).toBe('colonizer-1'); // Report goes to defender
      expect(reportArg.missionType).toBe('colonization_raid');
      expect(reportArg.title).toContain('Sans defense');
      expect(reportArg.result.outcome).toBe('attacker');
      expect(reportArg.result.hasGarrison).toBe(false);
      expect(reportArg.result.pillaged).toEqual({ minerai: 500, silicium: 250, hydrogene: 100 });
    });

    it('runs combat when garrison exists', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      state.planetShips.push({ planetId: 'planet-target', fighter: 3 });

      (simulateCombat as any).mockReturnValue({
        outcome: 'attacker',
        attackerLosses: { fighter: 1 },
        defenderLosses: { fighter: 3 },
        repairedDefenses: {},
        rounds: [],
        debris: { minerai: 0, silicium: 0 },
        attackerStats: {}, defenderStats: {},
      });

      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(simulateCombat).toHaveBeenCalledTimes(1);
    });

    it('on combat victory: reduced (33%) pillage + base penalty', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '900', silicium: '300', hydrogene: '150',
      });
      state.planetShips.push({ planetId: 'planet-target', fighter: 3 });

      (simulateCombat as any).mockReturnValue({
        outcome: 'attacker',
        attackerLosses: { fighter: 1 },
        defenderLosses: { fighter: 3 },
        repairedDefenses: {},
        rounds: [],
        debris: { minerai: 0, silicium: 0 },
        attackerStats: {}, defenderStats: {},
      });

      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      // 33% pillage → planet keeps 67% (with floating-point: 0.6699999...)
      expect(state.planetUpdates).toHaveLength(1);
      expect(state.planetUpdates[0].minerai).toBe(String(Math.floor(900 * (1 - 0.33))));
      expect(state.planetUpdates[0].silicium).toBe(String(Math.floor(300 * (1 - 0.33))));
      expect(state.planetUpdates[0].hydrogene).toBe(String(Math.floor(150 * (1 - 0.33))));
      // Progress penalty applied + lastRaidAt
      expect(state.processProgressUpdates).toBe(1);
      expect(state.processLastRaidUpdates).toBe(1);
    });

    it('on combat defeat: NO pillage, NO progression penalty (only lastRaidAt)', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      state.planetShips.push({ planetId: 'planet-target', fighter: 100 });

      (simulateCombat as any).mockReturnValue({
        outcome: 'defender',
        attackerLosses: { fighter: 5 },
        defenderLosses: { fighter: 0 },
        repairedDefenses: {},
        rounds: [],
        debris: { minerai: 0, silicium: 0 },
        attackerStats: {}, defenderStats: {},
      });

      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(state.planetUpdates).toHaveLength(0); // No pillage
      expect(state.processProgressUpdates).toBe(0); // No penalty
      expect(state.processLastRaidUpdates).toBe(1); // Still updates timestamp
    });

    it('on combat draw: reduced (50%) penalty, NO pillage', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      state.planetShips.push({ planetId: 'planet-target', fighter: 5 });

      (simulateCombat as any).mockReturnValue({
        outcome: 'draw',
        attackerLosses: { fighter: 5 },
        defenderLosses: { fighter: 5 },
        repairedDefenses: {},
        rounds: [],
        debris: { minerai: 0, silicium: 0 },
        attackerStats: {}, defenderStats: {},
      });

      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(state.planetUpdates).toHaveLength(0); // No pillage on draw
      expect(state.processProgressUpdates).toBe(1); // Penalty applied (reduced)
      expect(state.processLastRaidUpdates).toBe(1);
    });

    it('skips colonization process updates when getProcess returns null', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '1000', silicium: '500', hydrogene: '200',
      });
      // No garrison → enters no-defense branch
      const colonizationService = {
        getProcess: vi.fn().mockResolvedValue(null),
      };
      const handler = new ColonizationRaidHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx({ colonizationService: colonizationService as any }));

      // Pillage still applied (planet update)
      expect(state.planetUpdates).toHaveLength(1);
      // But no progress/lastRaid updates since process is null
      expect(state.processProgressUpdates).toBe(0);
      expect(state.processLastRaidUpdates).toBe(0);
    });

    it('return scheduleReturn=false (raids do not return)', async () => {
      state.planets.push({
        id: 'planet-target', userId: 'colonizer-1',
        galaxy: 1, system: 10, position: 5, name: 'Outpost', status: 'colonizing',
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      const handler = new ColonizationRaidHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(false);
    });
  });
});

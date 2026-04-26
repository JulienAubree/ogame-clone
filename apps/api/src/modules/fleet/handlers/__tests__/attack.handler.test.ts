import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets', id: { __c: 'planets.id' }, galaxy: { __c: 'planets.galaxy' }, system: { __c: 'planets.system' }, position: { __c: 'planets.position' }, userId: { __c: 'planets.userId' }, name: { __c: 'planets.name' } },
  planetShips: { __t: 'planetShips' },
  planetDefenses: { __t: 'planetDefenses' },
  planetBuildings: { __t: 'planetBuildings' },
  userResearch: { __t: 'userResearch' },
  allianceMembers: { __t: 'allianceMembers' },
  alliances: { __t: 'alliances' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
  sql: () => ({ __op: 'sql' }),
  inArray: (col: unknown, vals: unknown[]) => ({ __op: 'inArray', col, vals }),
}));

vi.mock('@exilium/game-engine', () => ({
  simulateCombat: vi.fn(),
  totalCargoCapacity: vi.fn((ships: Record<string, number>) => Object.keys(ships).length === 0 ? 0 : 1000),
  calculateShieldCapacity: vi.fn(() => 0),
  calculateProtectedResources: vi.fn(() => ({ minerai: 0, silicium: 0, hydrogene: 0 })),
}));

vi.mock('../../../notification/notification.publisher.js', () => ({
  publishNotification: vi.fn(),
}));

vi.mock('../../fleet.types.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../fleet.types.js')>();
  return {
    ...actual,
    buildShipStatsMap: vi.fn(() => ({})),
    buildShipCombatConfigs: vi.fn(() => ({})),
    buildShipCosts: vi.fn(() => ({})),
  };
});

vi.mock('../../combat.helpers.js', () => ({
  buildCombatConfig: vi.fn(() => ({})),
  parseUnitRow: vi.fn(() => ({})),
  computeCombatMultipliers: vi.fn().mockResolvedValue({
    attackerMultipliers: { weapons: 1, shielding: 1, armor: 1 },
    defenderMultipliers: { weapons: 1, shielding: 1, armor: 1 },
    defenderTalentCtx: {},
  }),
  applyDefenderLosses: vi.fn().mockResolvedValue(undefined),
  upsertDebris: vi.fn().mockResolvedValue(undefined),
  computeBothFP: vi.fn(() => ({ attackerFP: 100, defenderFP: 0 })),
  computeShotsPerRound: vi.fn(() => 1),
  fetchUsernames: vi.fn().mockResolvedValue({ attackerUsername: 'Attacker', defenderUsername: 'Defender' }),
  buildCombatReportData: vi.fn(() => ({})),
  outcomeText: vi.fn(() => 'Victoire'),
  defenderOutcome: vi.fn(() => 'defeat'),
}));

import { AttackHandler, outcomeFromAttackerSide, outcomeFromDefenderSide } from '../attack.handler.js';
import { simulateCombat } from '@exilium/game-engine';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';
import { TRPCError } from '@trpc/server';

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
  planetShips: Array<{ planetId: string; [key: string]: unknown }>;
  planetDefenses: Array<{ planetId: string; [key: string]: unknown }>;
  planetBuildings: Array<{ planetId: string; buildingId: string; level: number }>;
  selectCallSequence: string[];
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
    if (ctx.table === 'planetDefenses') return state.planetDefenses.map(p => ({ ...p }));
    if (ctx.table === 'planetBuildings') return state.planetBuildings.map(p => ({ ...p }));
    return [];
  };
  const chain: any = {
    from(table: unknown) {
      ctx.table = tableOf(table);
      if (ctx.table) state.selectCallSequence.push(ctx.table);
      return chain;
    },
    where() { return chain; },
    limit() { return chain; },
    innerJoin() { return chain; },
    then(onResolve: (v: unknown[]) => unknown, onReject?: (e: unknown) => unknown) {
      return Promise.resolve(results()).then(onResolve, onReject);
    },
  };
  return chain;
}

function buildInsertChain() {
  const chain: any = {
    values() { return chain; },
    onConflictDoNothing() { return Promise.resolve(); },
    onConflictDoUpdate() { return Promise.resolve(); },
  };
  return chain;
}

function buildUpdateChain() {
  const chain: any = {
    set() { return chain; },
    where() { return Promise.resolve(); },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  insert: vi.fn(() => buildInsertChain()),
  update: vi.fn(() => buildUpdateChain()),
};

function makeFleetEvent(overrides: Partial<FleetEvent> = {}): FleetEvent {
  return {
    id: 'fe-1',
    userId: 'attacker-1',
    originPlanetId: 'planet-origin',
    targetPlanetId: null,
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'attack',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { fighter: 10 },
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
        ships: { fighter: { id: 'fighter' } },
        defenses: {},
        universe: {},
      }),
    } as any,
    reportService: {
      create: vi.fn().mockResolvedValue({ id: 'report-1' }),
    } as any,
    fleetQueue: {} as any,
    assetsDir: '/tmp',
    resourceService: {
      materializeResources: vi.fn().mockResolvedValue(undefined),
    } as any,
    ...overrides,
  } as MissionHandlerContext;
}

describe('AttackHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      planetShips: [],
      planetDefenses: [],
      planetBuildings: [],
      selectCallSequence: [],
    };
    vi.clearAllMocks();
  });

  describe('outcome mappings', () => {
    it('maps attacker-side outcomes', () => {
      expect(outcomeFromAttackerSide('attacker')).toBe('victory');
      expect(outcomeFromAttackerSide('defender')).toBe('defeat');
      expect(outcomeFromAttackerSide('draw')).toBe('draw');
    });

    it('maps defender-side outcomes', () => {
      expect(outcomeFromDefenderSide('attacker')).toBe('defeat');
      expect(outcomeFromDefenderSide('defender')).toBe('victory');
      expect(outcomeFromDefenderSide('draw')).toBe('draw');
    });
  });

  describe('validateFleet', () => {
    it('throws when attacking own planet (same userId on origin and target)', async () => {
      state.planets.push(
        { id: 'planet-origin', userId: 'user-1', galaxy: 1, system: 1, position: 1, name: 'Home', minerai: '0', silicium: '0', hydrogene: '0' },
        { id: 'planet-target', userId: 'user-1', galaxy: 1, system: 10, position: 5, name: 'Target', minerai: '0', silicium: '0', hydrogene: '0' },
      );
      const handler = new AttackHandler();
      await expect(handler.validateFleet(
        { userId: 'user-1', originPlanetId: 'planet-origin', targetGalaxy: 1, targetSystem: 10, targetPosition: 5, mission: 'attack', ships: { fighter: 1 } },
        {} as any,
        makeCtx(),
      )).rejects.toThrow(TRPCError);
    });

    it('does not throw when attacking different player', async () => {
      // Both planets belong to different users — fake state has only one planet per call;
      // we rely on selectCallSequence to differentiate. Simpler: test that no throw occurs
      // when target.userId !== origin.userId by mocking differently.
      // Here we use a single planet that returns different users via state mutation.
      let callCount = 0;
      const customSelect = vi.fn(() => {
        callCount++;
        const ctx: { table: string | null } = { table: null };
        const results = (): unknown[] => {
          if (ctx.table === 'planets') {
            return [{ userId: callCount === 1 ? 'defender-1' : 'attacker-1' }];
          }
          return [];
        };
        const chain: any = {
          from(table: unknown) { ctx.table = tableOf(table); return chain; },
          where() { return chain; },
          limit() { return chain; },
          then(onResolve: (v: unknown[]) => unknown) {
            return Promise.resolve(results()).then(onResolve);
          },
        };
        return chain;
      });

      const ctx = makeCtx({ db: { ...mockDb, select: customSelect } as any });
      const handler = new AttackHandler();
      await expect(handler.validateFleet(
        { userId: 'attacker-1', originPlanetId: 'planet-origin', targetGalaxy: 1, targetSystem: 10, targetPosition: 5, mission: 'attack', ships: { fighter: 1 } },
        {} as any,
        ctx,
      )).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('aborts with cargo refund when target planet does not exist', async () => {
      const handler = new AttackHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ mineraiCargo: '500', siliciumCargo: '300', hydrogeneCargo: '100' }),
        makeCtx(),
      );

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 300, hydrogene: 100 });
    });

    it('creates aborted report when target missing', async () => {
      const ctx = makeCtx();
      const handler = new AttackHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const reportCalls = (ctx.reportService!.create as any).mock.calls;
      expect(reportCalls).toHaveLength(1);
      const reportArg = reportCalls[0][0];
      expect(reportArg.missionType).toBe('attack');
      expect(reportArg.title).toContain('Avortée');
      expect(reportArg.result).toEqual({ aborted: true, reason: 'no_planet' });
    });

    it('auto-victory when defender has no fleet and no defenses (simulateCombat skipped)', async () => {
      state.planets.push({
        id: 'planet-target',
        userId: 'defender-1',
        galaxy: 1, system: 10, position: 5,
        name: 'Target',
        minerai: '1000', silicium: '500', hydrogene: '0',
      });
      // No defenders. With cargo=0 (no ships/empty fleet), the loot branch is skipped.
      const ctx = makeCtx({
        resourceService: {
          materializeResources: vi.fn().mockResolvedValue(undefined),
          getBuildingLevels: vi.fn().mockResolvedValue({}),
        } as any,
      });

      const handler = new AttackHandler();
      // Empty fleet to hit "no defenders" branch + skip loot (cargo=0 short-circuits)
      const result = await handler.processArrival(makeFleetEvent({ ships: {} }), ctx);

      // simulateCombat NOT called when no defenders (auto-victory)
      expect(simulateCombat).not.toHaveBeenCalled();
      // Empty fleet → no ships return
      expect(result.scheduleReturn).toBe(false);
    });
  });
});

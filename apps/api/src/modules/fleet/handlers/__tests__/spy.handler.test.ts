import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  planets: { __t: 'planets', id: { __c: 'id' }, galaxy: { __c: 'galaxy' }, system: { __c: 'system' }, position: { __c: 'position' }, name: { __c: 'name' } },
  planetShips: { __t: 'planetShips', planetId: { __c: 'planetId' } },
  planetDefenses: { __t: 'planetDefenses', planetId: { __c: 'planetId' } },
  planetBuildings: { __t: 'planetBuildings', planetId: { __c: 'planetId' }, buildingId: { __c: 'buildingId' }, level: { __c: 'level' } },
  userResearch: { __t: 'userResearch', userId: { __c: 'userId' }, espionageTech: { __c: 'espionageTech' } },
  flagships: { __t: 'flagships', userId: { __c: 'userId' }, planetId: { __c: 'planetId' }, status: { __c: 'status' } },
  flagshipTalents: { __t: 'flagshipTalents', flagshipId: { __c: 'flagshipId' }, talentId: { __c: 'talentId' }, currentRank: { __c: 'currentRank' } },
  allianceMembers: { __t: 'allianceMembers', userId: { __c: 'userId' }, allianceId: { __c: 'allianceId' } },
  alliances: { __t: 'alliances', id: { __c: 'id' }, tag: { __c: 'tag' } },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  inArray: (col: unknown, vals: unknown) => ({ __op: 'inArray', col, vals }),
}));

vi.mock('@exilium/game-engine', () => ({
  calculateSpyReport: vi.fn(() => ({
    resources: false,
    fleet: false,
    defenses: false,
    buildings: false,
    research: false,
  })),
  calculateDetectionChance: vi.fn(() => 0),
  totalCargoCapacity: vi.fn(() => 0),
  simulateCombat: vi.fn(),
}));

vi.mock('../../../lib/config-helpers.js', () => ({
  findShipByRole: vi.fn((config: any, role: string) => {
    const ship = Object.values(config.ships).find((s: any) => s.role === role);
    if (!ship) throw new Error(`No ship with role "${role}" found`);
    return ship;
  }),
  findShipsByRole: vi.fn((config: any, role: string) => {
    return Object.values(config.ships).filter((s: any) => s.role === role);
  }),
}));

vi.mock('../combat.helpers.js', () => ({
  buildCombatConfig: vi.fn(() => ({})),
  parseUnitRow: vi.fn(() => ({})),
  computeCombatMultipliers: vi.fn(),
  computeAttackerSurvivors: vi.fn(),
  applyDefenderLosses: vi.fn(),
  upsertDebris: vi.fn(),
  computeBothFP: vi.fn(),
  computeShotsPerRound: vi.fn(),
  fetchUsernames: vi.fn(),
  buildCombatReportData: vi.fn(),
  outcomeText: vi.fn(),
  defenderOutcome: vi.fn(),
}));

vi.mock('../../notification/notification.publisher.js', () => ({
  publishNotification: vi.fn(),
}));

import { SpyHandler } from '../spy.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakeState {
  planets: Array<{ id: string; userId: string; galaxy: number; system: number; position: number; name: string; minerai: string; silicium: string; hydrogene: string }>;
  planetShips: Array<Record<string, unknown>>;
  planetDefenses: Array<Record<string, unknown>>;
  userResearch: Array<{ userId: string; espionageTech?: number }>;
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
    innerJoin() { return chain; },
    where() { return chain; },
    limit() { return chain; },
    then(resolve: (v: unknown[]) => void) {
      if (ctx.table === 'planets') {
        resolve(state.planets.map(p => ({ ...p })));
      } else if (ctx.table === 'planetShips') {
        resolve(state.planetShips.map(s => ({ ...s })));
      } else if (ctx.table === 'planetDefenses') {
        resolve(state.planetDefenses.map(d => ({ ...d })));
      } else if (ctx.table === 'userResearch') {
        resolve(state.userResearch.map(r => ({ ...r })));
      } else {
        resolve([]);
      }
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
};

function makeConfig(): any {
  return {
    ships: {
      espionageProbe: { id: 'espionageProbe', role: 'espionage', baseSpeed: 50, fuelConsumption: 0, cargoCapacity: 0, driveType: 'fusion', miningExtraction: 0 },
      lightFighter: { id: 'lightFighter', role: 'combat', baseSpeed: 12, fuelConsumption: 1, cargoCapacity: 50, driveType: 'fusion', miningExtraction: 0 },
    },
    universe: {
      spy_visibility_thresholds: [1, 3, 5, 7, 9],
      spy_probe_multiplier: 2,
      spy_tech_multiplier: 4,
    },
    defenses: {},
    talents: {},
    hulls: {},
  };
}

function makeFleetEvent(overrides: Partial<FleetEvent> = {}): FleetEvent {
  return {
    id: 'fe-1',
    userId: 'user-1',
    originPlanetId: 'planet-origin',
    targetPlanetId: null,
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'spy',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { espionageProbe: 5 },
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
      getFullConfig: vi.fn().mockResolvedValue(makeConfig()),
    } as any,
    reportService: {
      create: vi.fn().mockResolvedValue({ id: 'report-1' }),
    } as any,
    resourceService: {
      materializeResources: vi.fn().mockResolvedValue(undefined),
    } as any,
    fleetQueue: {} as any,
    assetsDir: '/tmp',
    ...overrides,
  } as MissionHandlerContext;
}

describe('SpyHandler', () => {
  beforeEach(() => {
    state = {
      planets: [],
      planetShips: [],
      planetDefenses: [],
      userResearch: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when fleet contains a non-espionage ship', async () => {
      const handler = new SpyHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'spy',
        ships: { espionageProbe: 1, lightFighter: 1 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).rejects.toThrow(/sondes d'espionnage/);
    });

    it('allows fleet of only espionage probes', async () => {
      const handler = new SpyHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'spy',
        ships: { espionageProbe: 5 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).resolves.toBeUndefined();
    });

    it('allows flagship in the espionage fleet', async () => {
      const handler = new SpyHandler();
      const input = {
        originPlanetId: 'planet-origin',
        targetGalaxy: 1, targetSystem: 10, targetPosition: 5,
        mission: 'spy',
        ships: { espionageProbe: 5, flagship: 1 },
      };
      await expect(handler.validateFleet(input as any, {} as any, makeCtx())).resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('returns aborted result + creates "no_planet" report when target planet is missing', async () => {
      const ctx = makeCtx();
      const handler = new SpyHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
      expect(result.reportId).toBe('report-1');

      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('spy');
      expect(reportArg.title).toContain('Avortée');
      expect((reportArg.result as any).aborted).toBe(true);
      expect((reportArg.result as any).reason).toBe('no_planet');
    });

    it('returns aborted result without report when reportService is absent and target missing', async () => {
      const handler = new SpyHandler();
      const ctx = makeCtx({ reportService: undefined });
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      expect(result.scheduleReturn).toBe(true);
      expect(result.reportId).toBeUndefined();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  fleetEvents: { __t: 'fleetEvents' },
  pveMissions: { __t: 'pveMissions' },
  planets: { __t: 'planets' },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn((ships: Record<string, number>) =>
    Object.values(ships).reduce((s, v) => s + v, 0) * 100
  ),
  computeFleetFP: vi.fn(() => 1000),
}));

vi.mock('../../fleet.types.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../fleet.types.js')>();
  return {
    ...actual,
    buildShipStatsMap: vi.fn(() => ({})),
    getCombatMultipliers: vi.fn().mockResolvedValue({ weapons: 1, shielding: 1, armor: 1 }),
  };
});

vi.mock('../../combat.helpers.js', () => ({
  upsertDebris: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../notification/notification.publisher.js', () => ({
  publishNotification: vi.fn(),
}));

import { PirateHandler } from '../pirate.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakeMission {
  id: string;
  parameters: { templateId: string; scaledFleet: Record<string, number>; pirateFP: number };
  rewards: { minerai: number; silicium: number; hydrogene: number; bonusShips: unknown[] };
}

interface FakeState {
  pveMissions: FakeMission[];
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
    targetPosition: 5,
    mission: 'pirate',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { fighter: 10 },
    metadata: null,
    pveMissionId: 'mission-1',
    tradeId: null,
    ...overrides,
  };
}

function makeBaseCombatResult(outcome: 'attacker' | 'defender' | 'draw' = 'attacker') {
  return {
    outcome,
    rounds: [{
      attackerShips: { fighter: 10 },
      defenderShips: { fighter: 5 },
      attackerLosses: { fighter: 0 },
      defenderLosses: { fighter: 5 },
    }],
    debris: { minerai: 100, silicium: 50 },
    attackerStats: { weapons: 100, shield: 50, hull: 200 },
    defenderStats: { weapons: 50, shield: 25, hull: 100 },
    defenderLosses: { fighter: 5 },
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue({
        ships: { fighter: { weapons: 10, shotCount: 1, shield: 5, hull: 20 } },
        universe: { fp_shotcount_exponent: 1.5, fp_divisor: 100 },
        bonuses: [],
      }),
    } as any,
    pveService: {
      completeMission: vi.fn().mockResolvedValue(undefined),
      releaseMission: vi.fn().mockResolvedValue(undefined),
    } as any,
    pirateService: {
      processPirateArrival: vi.fn().mockResolvedValue({
        outcome: 'attacker',
        survivingShips: { fighter: 8 },
        attackerLosses: { fighter: 2 },
        loot: { minerai: 100, silicium: 50, hydrogene: 0 },
        bonusShips: {},
        combatResult: makeBaseCombatResult('attacker'),
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

describe('PirateHandler', () => {
  beforeEach(() => {
    state = {
      pveMissions: [],
      planets: [],
      fleetEventUpdates: [],
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('does not throw — pirate has no validation (PvE-initiated)', async () => {
      const handler = new PirateHandler();
      await expect(handler.validateFleet({} as any, {} as any, {} as any))
        .resolves.toBeUndefined();
    });
  });

  describe('processArrival', () => {
    it('returns scheduleReturn with empty cargo when no pveMissionId', async () => {
      const handler = new PirateHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ pveMissionId: null }),
        makeCtx(),
      );
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    });

    it('returns scheduleReturn when mission not found', async () => {
      const handler = new PirateHandler();
      // state.pveMissions empty
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    });

    it('returns scheduleReturn when pirateService is missing', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 100, silicium: 50, hydrogene: 0, bonusShips: [] },
      });
      const handler = new PirateHandler();
      const ctx = makeCtx();
      delete (ctx as any).pirateService;
      const result = await handler.processArrival(makeFleetEvent(), ctx);
      expect(result.scheduleReturn).toBe(true);
    });

    it('completes mission on victory', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 100, silicium: 50, hydrogene: 0, bonusShips: [] },
      });
      const ctx = makeCtx();
      const handler = new PirateHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.pveService!.completeMission).toHaveBeenCalledWith('mission-1');
      expect(ctx.pveService!.releaseMission).not.toHaveBeenCalled();
    });

    it('releases mission on defeat', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 100, silicium: 50, hydrogene: 0, bonusShips: [] },
      });
      const pirateService = {
        processPirateArrival: vi.fn().mockResolvedValue({
          outcome: 'defender',
          survivingShips: {},
          attackerLosses: { fighter: 10 },
          loot: { minerai: 0, silicium: 0, hydrogene: 0 },
          bonusShips: {},
          combatResult: makeBaseCombatResult('defender'),
        }),
      };
      const ctx = makeCtx({ pirateService: pirateService as any });
      const handler = new PirateHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      expect(ctx.pveService!.releaseMission).toHaveBeenCalledWith('mission-1');
      expect(ctx.pveService!.completeMission).not.toHaveBeenCalled();
    });

    it('returns loot as cargo when victorious with surviving ships', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 100, silicium: 50, hydrogene: 0, bonusShips: [] },
      });
      const handler = new PirateHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      // Default mock: loot = { minerai: 100, silicium: 50, hydrogene: 0 }, surviving cargo = 8 ships * 100 = 800 (enough)
      expect(result.cargo).toEqual({ minerai: 100, silicium: 50, hydrogene: 0 });
      expect(result.shipsAfterArrival).toEqual({ fighter: 8 });
    });

    it('caps loot to surviving cargo capacity when overflow', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 1000, silicium: 1000, hydrogene: 1000, bonusShips: [] },
      });
      const pirateService = {
        processPirateArrival: vi.fn().mockResolvedValue({
          outcome: 'attacker',
          survivingShips: { fighter: 1 }, // survivingCargo = 1 * 100 = 100
          attackerLosses: { fighter: 9 },
          loot: { minerai: 600, silicium: 600, hydrogene: 600 }, // total = 1800, ratio = 100/1800
          bonusShips: {},
          combatResult: makeBaseCombatResult('attacker'),
        }),
      };
      const handler = new PirateHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx({ pirateService: pirateService as any }));

      // ratio = 100/1800 ≈ 0.055, floor(600 * 0.055) = 33
      expect(result.cargo!.minerai).toBe(33);
      expect(result.cargo!.silicium).toBe(33);
      expect(result.cargo!.hydrogene).toBe(33);
    });

    it('returns scheduleReturn=false when all ships destroyed', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 0, silicium: 0, hydrogene: 0, bonusShips: [] },
      });
      const pirateService = {
        processPirateArrival: vi.fn().mockResolvedValue({
          outcome: 'defender',
          survivingShips: {},
          attackerLosses: { fighter: 10 },
          loot: { minerai: 0, silicium: 0, hydrogene: 0 },
          bonusShips: {},
          combatResult: makeBaseCombatResult('defender'),
        }),
      };
      const handler = new PirateHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx({ pirateService: pirateService as any }));

      expect(result.scheduleReturn).toBe(false);
    });

    it('incapacitates flagship when destroyed in combat', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 0, silicium: 0, hydrogene: 0, bonusShips: [] },
      });
      const pirateService = {
        processPirateArrival: vi.fn().mockResolvedValue({
          outcome: 'defender',
          survivingShips: { flagship: 1, fighter: 0 },
          attackerLosses: { flagship: 1 }, // flagship destroyed
          loot: { minerai: 0, silicium: 0, hydrogene: 0 },
          bonusShips: {},
          combatResult: makeBaseCombatResult('defender'),
        }),
      };
      const flagshipService = {
        get: vi.fn().mockResolvedValue({ baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 200, driveType: 'fusion', shield: 100, hull: 200, weapons: 50, shotCount: 1, baseArmor: 0 }),
        incapacitate: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new PirateHandler();
      await handler.processArrival(
        makeFleetEvent({ ships: { flagship: 1, fighter: 10 } }),
        makeCtx({ pirateService: pirateService as any, flagshipService: flagshipService as any }),
      );

      expect(flagshipService.incapacitate).toHaveBeenCalledWith('user-1');
    });

    it('triggers exilium drop on victory', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 100, silicium: 50, hydrogene: 0, bonusShips: [] },
      });
      const exiliumService = {
        tryDrop: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new PirateHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx({ exiliumService: exiliumService as any }));

      expect(exiliumService.tryDrop).toHaveBeenCalledWith('user-1', 'pve', expect.objectContaining({
        missionId: 'mission-1',
      }));
    });

    it('does not trigger exilium drop on defeat', async () => {
      state.pveMissions.push({
        id: 'mission-1',
        parameters: { templateId: 't1', scaledFleet: { fighter: 5 }, pirateFP: 50 },
        rewards: { minerai: 0, silicium: 0, hydrogene: 0, bonusShips: [] },
      });
      const pirateService = {
        processPirateArrival: vi.fn().mockResolvedValue({
          outcome: 'defender',
          survivingShips: { fighter: 2 },
          attackerLosses: { fighter: 8 },
          loot: { minerai: 0, silicium: 0, hydrogene: 0 },
          bonusShips: {},
          combatResult: makeBaseCombatResult('defender'),
        }),
      };
      const exiliumService = { tryDrop: vi.fn() };
      const handler = new PirateHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx({
        pirateService: pirateService as any,
        exiliumService: exiliumService as any,
      }));

      expect(exiliumService.tryDrop).not.toHaveBeenCalled();
    });
  });
});

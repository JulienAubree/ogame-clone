import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  flagships: {
    __t: 'flagships',
    id: { __c: 'id' },
    userId: { __c: 'userId' },
    hullId: { __c: 'hullId' },
    status: { __c: 'status' },
  },
  flagshipCooldowns: {
    __t: 'flagshipCooldowns',
    flagshipId: { __c: 'flagshipId' },
    talentId: { __c: 'talentId' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...conds: unknown[]) => ({ __op: 'and', conds }),
}));

const spyHandlerProcessArrival = vi.fn();

vi.mock('../spy.handler.js', () => ({
  SpyHandler: vi.fn().mockImplementation(() => ({
    processArrival: spyHandlerProcessArrival,
  })),
}));

import { ScanHandler } from '../scan.handler.js';
import type { MissionHandlerContext, FleetEvent } from '../../fleet.types.js';

interface FakeFlagship {
  id: string;
  userId: string;
  hullId: string | null;
  status: string;
}

interface FakeCooldown {
  flagshipId: string;
  talentId: string;
  cooldownEnds: Date | null;
}

interface FakeState {
  flagships: FakeFlagship[];
  cooldowns: FakeCooldown[];
  cooldownInserts: Array<{ values: Record<string, unknown>; conflictSet: Record<string, unknown> }>;
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
      if (ctx.table === 'flagships') {
        resolve(state.flagships.map(f => ({ ...f })));
      } else if (ctx.table === 'flagshipCooldowns') {
        resolve(state.cooldowns.map(c => ({ ...c })));
      } else {
        resolve([]);
      }
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
      if (marker === 'flagshipCooldowns') {
        state.cooldownInserts.push({ values: insertValues, conflictSet: opts.set });
      }
      return Promise.resolve();
    },
  };
  return chain;
}

const mockDb = {
  select: vi.fn(() => buildSelectChain()),
  insert: vi.fn((t: unknown) => buildInsertChain(t)),
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
    mission: 'scan',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '0',
    siliciumCargo: '0',
    hydrogeneCargo: '0',
    ships: { flagship: 1 },
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
        hulls: {
          'scientific-hull': {
            abilities: [
              { id: 'scan_mission', type: 'active', cooldownSeconds: 1800, params: { espionageBonus: 5 } },
            ],
          },
          'combat-hull': {
            abilities: [
              { id: 'attack_boost', type: 'active' },
            ],
          },
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

describe('ScanHandler', () => {
  beforeEach(() => {
    state = {
      flagships: [],
      cooldowns: [],
      cooldownInserts: [],
    };
    vi.clearAllMocks();
    spyHandlerProcessArrival.mockReset();
  });

  describe('validateFleet', () => {
    it('throws when no flagship in input.ships', async () => {
      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { transporterMedium: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/amiral/);
    });

    it('throws when input.ships.flagship is 0', async () => {
      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 0 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/amiral/);
    });

    it('throws when flagship not found in DB', async () => {
      // state.flagships is empty
      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/introuvable/);
    });

    it('throws when hull has no scan ability', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'combat-hull', status: 'active' });
      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/scan/i);
    });

    it('throws when scan is on cooldown (cooldownEnds in the future)', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      const future = new Date(Date.now() + 60_000); // 1 min in the future
      state.cooldowns.push({ flagshipId: 'fs-1', talentId: 'scan_mission', cooldownEnds: future });

      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).rejects.toThrow(/cooldown/i);
    });

    it('does NOT throw when cooldown is expired (cooldownEnds in the past)', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      const past = new Date(Date.now() - 60_000); // 1 min ago
      state.cooldowns.push({ flagshipId: 'fs-1', talentId: 'scan_mission', cooldownEnds: past });

      const handler = new ScanHandler();
      await expect(
        handler.validateFleet(
          { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 1 } } as any,
          {} as any,
          makeCtx(),
        ),
      ).resolves.toBeUndefined();
    });

    it('inserts cooldown row when validation succeeds', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      // no existing cooldown

      const handler = new ScanHandler();
      await handler.validateFleet(
        { userId: 'user-1', originPlanetId: 'p1', targetGalaxy: 1, targetSystem: 1, targetPosition: 1, mission: 'scan', ships: { flagship: 1 } } as any,
        {} as any,
        makeCtx(),
      );

      expect(state.cooldownInserts).toHaveLength(1);
      expect(state.cooldownInserts[0].values).toMatchObject({
        flagshipId: 'fs-1',
        talentId: 'scan_mission',
      });
      expect(state.cooldownInserts[0].values).toHaveProperty('cooldownEnds');
      expect(state.cooldownInserts[0].conflictSet).toHaveProperty('cooldownEnds');
    });
  });

  describe('processArrival', () => {
    it('delegates to SpyHandler.processArrival with virtual probe and scanMission metadata', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      spyHandlerProcessArrival.mockResolvedValue({
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
        reportId: 'spy-report-1',
      });

      const handler = new ScanHandler();
      await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(spyHandlerProcessArrival).toHaveBeenCalledTimes(1);
      const callArgs = spyHandlerProcessArrival.mock.calls[0];
      const modifiedEvent = callArgs[0] as FleetEvent;
      expect(modifiedEvent.ships).toEqual({ espionageProbe: 1 });
      expect(modifiedEvent.metadata).toMatchObject({
        scanMission: true,
        espionageBonus: 5,
      });
    });

    it('always destroys the probe — shipsAfterArrival = {} and cargo zeroed', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      spyHandlerProcessArrival.mockResolvedValue({
        scheduleReturn: false, // SpyHandler returns false (probe destroyed there too)
        shipsAfterArrival: { espionageProbe: 1 },
        cargo: { minerai: 100, silicium: 50, hydrogene: 25 },
        reportId: 'spy-report-1',
      });

      const handler = new ScanHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      // Scan handler always overrides — probe never returns
      expect(result.scheduleReturn).toBe(true);
      expect(result.shipsAfterArrival).toEqual({});
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    });

    it('passes through reportId and other fields from SpyHandler result', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      spyHandlerProcessArrival.mockResolvedValue({
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
        reportId: 'spy-report-42',
        defenderReportId: 'def-report-99',
      });

      const handler = new ScanHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.reportId).toBe('spy-report-42');
      expect(result.defenderReportId).toBe('def-report-99');
    });

    it('uses default espionage bonus of 5 when ability params not configured', async () => {
      state.flagships.push({ id: 'fs-1', userId: 'user-1', hullId: 'scientific-hull', status: 'active' });
      spyHandlerProcessArrival.mockResolvedValue({
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      });

      const ctx = makeCtx({
        gameConfigService: {
          getFullConfig: vi.fn().mockResolvedValue({
            hulls: {
              'scientific-hull': {
                abilities: [
                  { id: 'scan_mission', type: 'active' /* no params */ },
                ],
              },
            },
          }),
        } as any,
      });

      const handler = new ScanHandler();
      await handler.processArrival(makeFleetEvent(), ctx);

      const modifiedEvent = spyHandlerProcessArrival.mock.calls[0][0] as FleetEvent;
      expect((modifiedEvent.metadata as any).espionageBonus).toBe(5);
    });

    it('handles missing flagship/hull gracefully (default bonus)', async () => {
      // No flagship in DB
      spyHandlerProcessArrival.mockResolvedValue({
        scheduleReturn: true,
        cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      });

      const handler = new ScanHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      // Should still work and override return values
      expect(result.shipsAfterArrival).toEqual({});
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });

      // Default bonus of 5 should be passed
      const modifiedEvent = spyHandlerProcessArrival.mock.calls[0][0] as FleetEvent;
      expect((modifiedEvent.metadata as any).espionageBonus).toBe(5);
    });
  });
});

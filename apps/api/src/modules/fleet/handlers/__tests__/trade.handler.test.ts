import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@exilium/db', () => ({
  marketOffers: {
    __t: 'marketOffers',
    id: { __c: 'marketOffers.id' },
    status: { __c: 'marketOffers.status' },
    sellerId: { __c: 'marketOffers.sellerId' },
  },
  planets: {
    __t: 'planets',
    id: { __c: 'planets.id' },
    name: { __c: 'planets.name' },
    galaxy: { __c: 'planets.galaxy' },
    system: { __c: 'planets.system' },
    position: { __c: 'planets.position' },
  },
  explorationReports: {
    __t: 'explorationReports',
    id: { __c: 'explorationReports.id' },
  },
  discoveredBiomes: { __t: 'discoveredBiomes' },
  discoveredPositions: { __t: 'discoveredPositions' },
  users: {
    __t: 'users',
    id: { __c: 'users.id' },
    username: { __c: 'users.username' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  ne: (col: unknown, val: unknown) => ({ __op: 'ne', col, val }),
}));

vi.mock('@exilium/game-engine', () => ({
  totalCargoCapacity: vi.fn(() => 1000),
}));

vi.mock('../../notification/notification.publisher.js', () => ({
  publishNotification: vi.fn(),
}));

import { TradeHandler } from '../trade.handler.js';
import type { MissionHandlerContext, FleetEvent, SendFleetInput } from '../../fleet.types.js';
import { TRPCError } from '@trpc/server';

interface FakeOffer {
  id: string;
  sellerId: string;
  planetId: string;
  status: string;
  priceMinerai: string;
  priceSilicium: string;
  priceHydrogene: string;
  resourceType: string | null;
  quantity: string;
  explorationReportId: string | null;
  reservedBy?: string | null;
  reservedAt?: Date | null;
}

interface FakePlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  minerai?: string;
  silicium?: string;
  hydrogene?: string;
}

interface FakeReport {
  id: string;
  galaxy: number;
  system: number;
  position: number;
  biomes: Array<{ id: string; name: string; rarity: string; effects: unknown }>;
  planetClassId: string | null;
  isComplete: boolean;
  status: string;
}

interface FakeUser {
  id: string;
  username: string;
}

interface FakeState {
  offers: FakeOffer[];
  planets: FakePlanet[];
  reports: FakeReport[];
  users: FakeUser[];
  offerUpdates: Array<{ id: string; values: Record<string, unknown> }>;
  planetUpdates: Array<{ id: string; values: Record<string, unknown> }>;
  reportUpdates: Array<{ id: string; values: Record<string, unknown> }>;
  insertedDiscoveredPositions: Array<Record<string, unknown>>;
  insertedDiscoveredBiomes: Array<Record<string, unknown>>;
  // For UPDATE...RETURNING in validateFleet's atomic reservation
  updateMatchesActive: boolean;
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
      if (ctx.table === 'marketOffers') {
        // Filter offers by status='reserved' if specified
        if (ctx.whereJson.includes('reserved')) {
          resolve(state.offers.filter(o => o.status === 'reserved').map(o => ({ ...o })));
          return;
        }
        resolve(state.offers.map(o => ({ ...o })));
        return;
      }
      if (ctx.table === 'planets') {
        resolve(state.planets.map(p => ({ ...p })));
        return;
      }
      if (ctx.table === 'explorationReports') {
        resolve(state.reports.map(r => ({ ...r })));
        return;
      }
      if (ctx.table === 'users') {
        resolve(state.users.map(u => ({ ...u })));
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

  // The where() call is a "thenable" so it works both as `await update(...)` and
  // `update(...).returning()`.
  function makeWhereResult() {
    const apply = () => {
      if (marker === 'marketOffers') {
        for (const o of state.offers) {
          state.offerUpdates.push({ id: o.id, values: { ...pendingValues } });
          if (typeof pendingValues.status === 'string') o.status = pendingValues.status as string;
        }
      } else if (marker === 'planets') {
        for (const p of state.planets) {
          state.planetUpdates.push({ id: p.id, values: { ...pendingValues } });
        }
      } else if (marker === 'explorationReports') {
        for (const r of state.reports) {
          state.reportUpdates.push({ id: r.id, values: { ...pendingValues } });
        }
      }
    };
    const whereResult: any = {
      then(resolve: (v: unknown) => void) {
        apply();
        resolve(undefined);
      },
      returning() {
        if (marker === 'marketOffers') {
          if (!state.updateMatchesActive) return Promise.resolve([]);
          const offer = state.offers.find(o => o.status === 'active');
          if (!offer) return Promise.resolve([]);
          offer.status = (pendingValues.status as string) ?? offer.status;
          if (typeof pendingValues.reservedBy === 'string') offer.reservedBy = pendingValues.reservedBy as string;
          state.offerUpdates.push({ id: offer.id, values: { ...pendingValues } });
          return Promise.resolve([{ ...offer }]);
        }
        return Promise.resolve([]);
      },
    };
    return whereResult;
  }

  const chain: any = {
    set(values: Record<string, unknown>) { pendingValues = values; return chain; },
    where() { return makeWhereResult(); },
  };
  return chain;
}

function buildInsertChain(table: unknown) {
  const marker = tableOf(table);
  const chain: any = {
    values(vals: any) {
      if (marker === 'discoveredPositions') {
        const arr = Array.isArray(vals) ? vals : [vals];
        state.insertedDiscoveredPositions.push(...arr);
      } else if (marker === 'discoveredBiomes') {
        const arr = Array.isArray(vals) ? vals : [vals];
        state.insertedDiscoveredBiomes.push(...arr);
      }
      return chain;
    },
    onConflictDoNothing() { return Promise.resolve(); },
    onConflictDoUpdate() { return Promise.resolve(); },
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
    userId: 'buyer-1',
    originPlanetId: 'planet-buyer',
    targetPlanetId: null,
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'trade',
    phase: 'outbound',
    status: 'active',
    departureTime: new Date('2026-01-01T00:00:00Z'),
    arrivalTime: new Date('2026-01-01T01:00:00Z'),
    mineraiCargo: '100',
    siliciumCargo: '200',
    hydrogeneCargo: '50',
    ships: { transporterMedium: 5 },
    metadata: null,
    pveMissionId: null,
    tradeId: 'offer-1',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MissionHandlerContext> = {}): MissionHandlerContext {
  return {
    db: mockDb,
    gameConfigService: {
      getFullConfig: vi.fn().mockResolvedValue({
        ships: {
          transporterMedium: { baseSpeed: 10, fuelConsumption: 1, cargoCapacity: 200, driveType: 'fusion' },
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

function makeInput(overrides: Partial<SendFleetInput> = {}): SendFleetInput {
  return {
    userId: 'buyer-1',
    originPlanetId: 'planet-buyer',
    targetGalaxy: 1,
    targetSystem: 10,
    targetPosition: 5,
    mission: 'trade',
    ships: { transporterMedium: 5 },
    mineraiCargo: 100,
    siliciumCargo: 200,
    hydrogeneCargo: 50,
    tradeId: 'offer-1',
    ...overrides,
  };
}

describe('TradeHandler', () => {
  beforeEach(() => {
    state = {
      offers: [],
      planets: [],
      reports: [],
      users: [],
      offerUpdates: [],
      planetUpdates: [],
      reportUpdates: [],
      insertedDiscoveredPositions: [],
      insertedDiscoveredBiomes: [],
      updateMatchesActive: false,
    };
    vi.clearAllMocks();
  });

  describe('validateFleet', () => {
    it('throws when tradeId is missing', async () => {
      const handler = new TradeHandler();
      const input = makeInput({ tradeId: undefined });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).rejects.toThrow(TRPCError);
    });

    it('throws when userId is missing', async () => {
      const handler = new TradeHandler();
      const input = makeInput({ userId: undefined });
      await expect(handler.validateFleet(input, {} as any, makeCtx())).rejects.toThrow(TRPCError);
    });

    it('throws NOT_FOUND when offer does not exist (no active match, no row at all)', async () => {
      state.updateMatchesActive = false;
      // No existing offer
      const handler = new TradeHandler();
      await expect(handler.validateFleet(makeInput(), {} as any, makeCtx())).rejects.toThrow(/Offre non disponible/);
    });

    it('throws BAD_REQUEST when buyer attempts to buy own offer', async () => {
      state.updateMatchesActive = false;
      state.offers.push({
        id: 'offer-1', sellerId: 'buyer-1', planetId: 'planet-seller', status: 'active',
        priceMinerai: '10', priceSilicium: '10', priceHydrogene: '0',
        resourceType: 'minerai', quantity: '100', explorationReportId: null,
      });
      const handler = new TradeHandler();
      await expect(handler.validateFleet(makeInput(), {} as any, makeCtx())).rejects.toThrow(/sa propre offre/);
    });

    it('throws BAD_REQUEST when offer already reserved', async () => {
      state.updateMatchesActive = false;
      state.offers.push({
        id: 'offer-1', sellerId: 'seller-1', planetId: 'planet-seller', status: 'reserved',
        priceMinerai: '10', priceSilicium: '10', priceHydrogene: '0',
        resourceType: 'minerai', quantity: '100', explorationReportId: null,
      });
      const handler = new TradeHandler();
      await expect(handler.validateFleet(makeInput(), {} as any, makeCtx())).rejects.toThrow(/déjà réservée/);
    });
  });

  describe('processArrival', () => {
    it('returns empty cargo when tradeId is missing', async () => {
      const handler = new TradeHandler();
      const result = await handler.processArrival(
        makeFleetEvent({ tradeId: null }),
        makeCtx(),
      );
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    });

    it('aborts with payment refund when offer no longer reserved (cancelled/expired)', async () => {
      // No offer in state — select returns empty
      const handler = new TradeHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      expect(result.scheduleReturn).toBe(true);
      // Buyer's payment is refunded as cargo
      expect(result.cargo).toEqual({ minerai: 100, silicium: 200, hydrogene: 50 });
      // No mutations
      expect(state.offerUpdates).toHaveLength(0);
      expect(state.planetUpdates).toHaveLength(0);
    });

    it('on success (resource offer): credits seller planet, marks offer sold, returns merchandise', async () => {
      state.offers.push({
        id: 'offer-1',
        sellerId: 'seller-1',
        planetId: 'planet-seller',
        status: 'reserved',
        priceMinerai: '100',
        priceSilicium: '200',
        priceHydrogene: '50',
        resourceType: 'minerai',
        quantity: '500',
        explorationReportId: null,
      });
      state.planets.push({
        id: 'planet-seller', name: 'Seller', galaxy: 1, system: 10, position: 5,
        minerai: '1000', silicium: '500', hydrogene: '200',
      });

      const ctx = makeCtx();
      const handler = new TradeHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      // Seller credited with price
      const sellerCredit = state.planetUpdates.find(u => u.values.minerai !== undefined);
      expect(sellerCredit).toBeDefined();
      expect(sellerCredit!.values).toEqual({
        minerai: '1100',  // 1000 + 100
        silicium: '700',  // 500 + 200
        hydrogene: '250', // 200 + 50
      });

      // Offer marked sold
      const soldUpdate = state.offerUpdates.find(u => u.values.status === 'sold');
      expect(soldUpdate).toBeDefined();

      // Merchandise loaded into return cargo
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 500, silicium: 0, hydrogene: 0 });
    });

    it('returns empty merchandise when offer is a report (no resourceType)', async () => {
      state.offers.push({
        id: 'offer-1',
        sellerId: 'seller-1',
        planetId: 'planet-seller',
        status: 'reserved',
        priceMinerai: '100',
        priceSilicium: '200',
        priceHydrogene: '50',
        resourceType: null,
        quantity: '0',
        explorationReportId: 'report-99',
      });
      state.planets.push({
        id: 'planet-seller', name: 'Seller', galaxy: 1, system: 10, position: 5,
        minerai: '0', silicium: '0', hydrogene: '0',
      });
      state.reports.push({
        id: 'report-99',
        galaxy: 7, system: 8, position: 9,
        biomes: [{ id: 'biome-1', name: 'Tundra', rarity: 'common', effects: [] }],
        planetClassId: 'temperate',
        isComplete: true,
        status: 'active',
      });
      state.users.push({ id: 'buyer-1', username: 'BuyerName' });
      state.users.push({ id: 'seller-1', username: 'SellerName' });

      const ctx = makeCtx();
      const handler = new TradeHandler();
      const result = await handler.processArrival(makeFleetEvent(), ctx);

      // Report-purchase short-circuits: returns no cargo merchandise
      expect(result.scheduleReturn).toBe(true);
      expect(result.cargo).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });

      // Buyer received discovered positions / biomes
      expect(state.insertedDiscoveredPositions).toHaveLength(1);
      expect(state.insertedDiscoveredPositions[0]).toMatchObject({
        userId: 'buyer-1',
        galaxy: 7, system: 8, position: 9,
        selfExplored: false,
      });
      expect(state.insertedDiscoveredBiomes).toHaveLength(1);

      // Report marked sold
      const reportSold = state.reportUpdates.find(u => u.values.status === 'sold');
      expect(reportSold).toBeDefined();

      // Trade mission report created
      expect(ctx.reportService!.create).toHaveBeenCalledTimes(1);
      const reportArg = (ctx.reportService!.create as any).mock.calls[0][0];
      expect(reportArg.missionType).toBe('trade');
      expect(reportArg.title).toContain('Rapport acquis');
    });

    it('does not credit seller when seller planet missing', async () => {
      state.offers.push({
        id: 'offer-1',
        sellerId: 'seller-1',
        planetId: 'planet-seller',
        status: 'reserved',
        priceMinerai: '100',
        priceSilicium: '200',
        priceHydrogene: '50',
        resourceType: 'silicium',
        quantity: '300',
        explorationReportId: null,
      });
      // No planet matching planet-seller
      const handler = new TradeHandler();
      const result = await handler.processArrival(makeFleetEvent(), makeCtx());

      // No planet update because sellerPlanet was undefined
      expect(state.planetUpdates).toHaveLength(0);

      // But offer is still marked sold
      const soldUpdate = state.offerUpdates.find(u => u.values.status === 'sold');
      expect(soldUpdate).toBeDefined();

      // Merchandise still loaded
      expect(result.cargo).toEqual({ minerai: 0, silicium: 300, hydrogene: 0 });
    });

    it('triggers daily quest hooks for both seller and buyer', async () => {
      state.offers.push({
        id: 'offer-1',
        sellerId: 'seller-1',
        planetId: 'planet-seller',
        status: 'reserved',
        priceMinerai: '100', priceSilicium: '200', priceHydrogene: '50',
        resourceType: 'minerai', quantity: '500',
        explorationReportId: null,
      });
      state.planets.push({
        id: 'planet-seller', name: 'Seller', galaxy: 1, system: 10, position: 5,
        minerai: '0', silicium: '0', hydrogene: '0',
      });

      const dailyQuestService = {
        processEvent: vi.fn().mockResolvedValue(undefined),
      };
      const handler = new TradeHandler();
      await handler.processArrival(
        makeFleetEvent(),
        makeCtx({ dailyQuestService: dailyQuestService as any }),
      );

      expect(dailyQuestService.processEvent).toHaveBeenCalledTimes(2);
      const userIds = dailyQuestService.processEvent.mock.calls.map((c) => c[0].userId);
      expect(userIds).toContain('seller-1');
      expect(userIds).toContain('buyer-1');
    });
  });
});

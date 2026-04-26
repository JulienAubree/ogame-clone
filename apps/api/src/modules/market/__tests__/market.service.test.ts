import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

// ── Fixtures / état mockable ────────────────────────────────────────

interface FakeOffer {
  id: string;
  sellerId: string;
  planetId: string;
  resourceType: 'minerai' | 'silicium' | 'hydrogene' | null;
  quantity: string | null;
  priceMinerai: string;
  priceSilicium: string;
  priceHydrogene: string;
  status: 'active' | 'reserved' | 'cancelled' | 'expired' | 'sold';
  expiresAt: Date;
  createdAt: Date;
  fleetEventId?: string | null;
  reservedBy?: string | null;
  reservedAt?: Date | null;
  explorationReportId?: string | null;
}

interface FakePlanet {
  id: string;
  galaxy: number;
  system: number;
  position: number;
  minerai: string;
  silicium: string;
  hydrogene: string;
}

interface FakeBuilding {
  planetId: string;
  buildingId: string;
  level: number;
}

interface FakeFleetEvent {
  id: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  status: string;
  phase: string;
  detectedAt: Date | null;
}

interface FakeReport {
  id: string;
  ownerId: string;
  status: 'inventory' | 'listed' | 'consumed';
}

let offers: FakeOffer[] = [];
let planets: FakePlanet[] = [];
let buildings: FakeBuilding[] = [];
let fleetEvents: FakeFleetEvent[] = [];
let reports: FakeReport[] = [];

let insertedOffer: FakeOffer | null = null;
let updateCalls: Array<{ table: string; values: Record<string, unknown>; matched?: number }> = [];

function resetState() {
  offers = [];
  planets = [
    {
      id: 'planet-1',
      galaxy: 1,
      system: 1,
      position: 1,
      minerai: '10000',
      silicium: '10000',
      hydrogene: '10000',
    },
  ];
  buildings = [
    { planetId: 'planet-1', buildingId: 'galacticMarket', level: 3 }, // max offers = 6
  ];
  fleetEvents = [];
  reports = [];
  insertedOffer = null;
  updateCalls = [];
}

// ── Mock Drizzle DB ────────────────────────────────────────────────
//
// Le service utilise plusieurs patterns :
// - select().from(table).where(...).limit(N)
// - select({...}).from(table).innerJoin(...).where(...).orderBy(...).limit(N)
// - insert(table).values(...).returning()
// - update(table).set(...).where(...)
//
// On retourne les bons résultats en se basant sur la "table" passée à .from().

// Drizzle expose un Symbol pour identifier la table cible. Comme on importe
// les vraies tables, on peut les comparer par référence.
import {
  marketOffers as marketOffersTable,
  planets as planetsTable,
  planetBuildings as planetBuildingsTable,
  fleetEvents as fleetEventsTable,
  explorationReports as explorationReportsTable,
} from '@exilium/db';

function buildSelectChain(fromTable: unknown, _projection?: unknown) {
  // L'état du chain : on track table + prêt à appliquer where/limit/orderBy.
  const chain: Record<string, unknown> = {};
  let resolved: unknown[] = [];

  const computeRows = (): unknown[] => {
    if (fromTable === marketOffersTable) return offers;
    if (fromTable === planetsTable) return planets;
    if (fromTable === planetBuildingsTable) return buildings;
    if (fromTable === fleetEventsTable) return fleetEvents;
    if (fromTable === explorationReportsTable) return reports;
    return [];
  };

  resolved = computeRows();

  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.for = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockImplementation(async (_n: number) => {
    // Pour countActiveOffers : si la projection contient `count`, retourner
    // un agrégat. Sinon retourner les rows.
    return resolved;
  });
  // Permettre l'await direct (sans .limit)
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(resolved);

  return chain;
}

const mockDbSelect = vi.fn().mockImplementation((projection?: unknown) => {
  return {
    from: vi.fn().mockImplementation((table: unknown) => {
      // Cas spécial : count(*) sur marketOffers (countActiveOffers)
      if (
        projection &&
        typeof projection === 'object' &&
        projection !== null &&
        'count' in projection
      ) {
        const chain: Record<string, unknown> = {};
        chain.where = vi.fn().mockImplementation(async () => {
          // On retourne le nombre d'offres actives/reserved du seller courant.
          // L'identification du sellerId se fait via le contexte des tests
          // (chaque test override si besoin).
          const activeCount = offers.filter(
            (o) => o.status === 'active' || o.status === 'reserved',
          ).length;
          return [{ count: activeCount }];
        });
        return chain;
      }
      return buildSelectChain(table, projection);
    }),
  };
});

const mockDbInsert = vi.fn().mockImplementation((table: unknown) => ({
  values: vi.fn().mockImplementation((vals: Record<string, unknown>) => ({
    returning: vi.fn().mockImplementation(async () => {
      if (table === marketOffersTable) {
        const offer: FakeOffer = {
          id: `offer-${offers.length + 1}`,
          sellerId: vals.sellerId as string,
          planetId: vals.planetId as string,
          resourceType: vals.resourceType as FakeOffer['resourceType'],
          quantity: (vals.quantity as string) ?? null,
          priceMinerai: vals.priceMinerai as string,
          priceSilicium: vals.priceSilicium as string,
          priceHydrogene: vals.priceHydrogene as string,
          status: vals.status as FakeOffer['status'],
          expiresAt: vals.expiresAt as Date,
          createdAt: new Date(),
          explorationReportId: (vals.explorationReportId as string) ?? null,
        };
        offers.push(offer);
        insertedOffer = offer;
        return [offer];
      }
      return [vals];
    }),
  })),
}));

const mockDbUpdate = vi.fn().mockImplementation((table: unknown) => ({
  set: vi.fn().mockImplementation((vals: Record<string, unknown>) => ({
    where: vi.fn().mockImplementation(async () => {
      const tableName =
        table === marketOffersTable
          ? 'marketOffers'
          : table === planetsTable
            ? 'planets'
            : table === explorationReportsTable
              ? 'explorationReports'
              : 'unknown';
      updateCalls.push({ table: tableName, values: vals });
      // Appliquer naïvement la mise à jour sur la première offre/planète
      // qui correspond. Pour la simplicité du mock, on update la 1ʳᵉ entrée.
      if (table === marketOffersTable && offers.length > 0) {
        Object.assign(offers[0]!, vals);
      }
      if (table === planetsTable && planets.length > 0) {
        Object.assign(planets[0]!, vals);
      }
      if (table === explorationReportsTable && reports.length > 0) {
        Object.assign(reports[0]!, vals);
      }
    }),
  })),
}));

const mockTransaction = vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
  const tx = {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
  };
  return cb(tx);
});

const mockDb = {
  select: mockDbSelect,
  insert: mockDbInsert,
  update: mockDbUpdate,
  transaction: mockTransaction,
} as unknown;

// ── Mock services ──────────────────────────────────────────────────

const mockSpendResources = vi.fn().mockResolvedValue(undefined);
const mockResourceService = {
  spendResources: mockSpendResources,
} as unknown;

const mockGameConfigService = {
  getFullConfig: vi.fn().mockResolvedValue({
    universe: {
      market_commission_percent: 5,
      market_offer_duration_hours: 48,
    },
  }),
} as unknown;

const mockComputeTalentContext = vi.fn().mockResolvedValue({});
const mockTalentService = {
  computeTalentContext: mockComputeTalentContext,
};

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
const mockQueueRemove = vi.fn().mockResolvedValue(undefined);
const mockMarketQueue = {
  add: mockQueueAdd,
  remove: mockQueueRemove,
} as unknown;

const mockRedisPublish = vi.fn().mockResolvedValue(1);
const mockRedis = { publish: mockRedisPublish } as unknown;

// ── Import dynamique du service ────────────────────────────────────

import { createMarketService } from '../market.service.js';

describe('market.service', () => {
  let service: ReturnType<typeof createMarketService>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    // Re-attach mocks proprement
    mockSpendResources.mockResolvedValue(undefined);
    mockComputeTalentContext.mockResolvedValue({});

    service = createMarketService(
      mockDb as never,
      mockResourceService as never,
      mockGameConfigService as never,
      mockMarketQueue as never,
      mockRedis as never,
      undefined,
      undefined,
      mockTalentService as never,
      undefined,
    );
  });

  // ── createOffer ──────────────────────────────────────────────────

  describe('createOffer()', () => {
    it('crée une offre de ressource avec succès', async () => {
      const offer = await service.createOffer('user-1', 'planet-1', {
        resourceType: 'minerai',
        quantity: 1000,
        priceMinerai: 0,
        priceSilicium: 500,
        priceHydrogene: 200,
      });

      expect(offer).toBeDefined();
      expect(offer.id).toBe('offer-1');
      expect(offer.resourceType).toBe('minerai');
      expect(offer.status).toBe('active');
      // Commission 5% de 1000 = 50, donc 1050 minerai dépensés
      expect(mockSpendResources).toHaveBeenCalledWith('planet-1', 'user-1', {
        minerai: 1050,
        silicium: 0,
        hydrogene: 0,
      });
      // Job d'expiration programmé
      expect(mockQueueAdd).toHaveBeenCalledWith(
        'market-expire',
        { offerId: 'offer-1' },
        expect.objectContaining({ jobId: 'market-expire-offer-1' }),
      );
    });

    it("refuse si le Marché Galactique n'est pas construit", async () => {
      buildings = []; // pas de bâtiment

      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 1000,
          priceMinerai: 100,
          priceSilicium: 0,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow(TRPCError);
      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 1000,
          priceMinerai: 100,
          priceSilicium: 0,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow('Marché Galactique requis');
    });

    it("refuse si une flotte hostile est en route vers la planète", async () => {
      fleetEvents = [
        {
          id: 'fe-1',
          targetGalaxy: 1,
          targetSystem: 1,
          targetPosition: 1,
          status: 'active',
          phase: 'outbound',
          detectedAt: new Date(),
        },
      ];

      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 1000,
          priceMinerai: 100,
          priceSilicium: 0,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow("Impossible de créer une offre pendant une attaque");
    });

    it('refuse si la limite max d\'offres actives est atteinte', async () => {
      // Marché niveau 3 = max 6 offres ; on en a déjà 6
      offers = Array.from({ length: 6 }, (_, i) => ({
        id: `offer-${i + 1}`,
        sellerId: 'user-1',
        planetId: 'planet-1',
        resourceType: 'minerai' as const,
        quantity: '100',
        priceMinerai: '0',
        priceSilicium: '50',
        priceHydrogene: '0',
        status: 'active' as const,
        expiresAt: new Date(),
        createdAt: new Date(),
      }));

      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 100,
          priceMinerai: 0,
          priceSilicium: 50,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow(/Nombre maximum d'offres atteint/);
    });

    it('refuse si la quantité est <= 0', async () => {
      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 0,
          priceMinerai: 100,
          priceSilicium: 0,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow('La quantité doit être supérieure à 0');
    });

    it("refuse si tous les prix sont à 0", async () => {
      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 100,
          priceMinerai: 0,
          priceSilicium: 0,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow('Le prix doit être supérieur à 0');
    });

    it('propage l\'erreur si spendResources échoue (stock insuffisant)', async () => {
      mockSpendResources.mockRejectedValueOnce(
        new TRPCError({ code: 'BAD_REQUEST', message: 'Ressources insuffisantes' }),
      );

      await expect(
        service.createOffer('user-1', 'planet-1', {
          resourceType: 'minerai',
          quantity: 1000,
          priceMinerai: 0,
          priceSilicium: 500,
          priceHydrogene: 0,
        }),
      ).rejects.toThrow('Ressources insuffisantes');

      // Aucune offre n'est insérée si la dépense échoue
      expect(insertedOffer).toBeNull();
    });
  });

  // ── cancelOffer ──────────────────────────────────────────────────

  describe('cancelOffer()', () => {
    it('annule une offre active appartenant à l\'utilisateur', async () => {
      offers = [
        {
          id: 'offer-1',
          sellerId: 'user-1',
          planetId: 'planet-1',
          resourceType: 'minerai',
          quantity: '500',
          priceMinerai: '0',
          priceSilicium: '100',
          priceHydrogene: '0',
          status: 'active',
          expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          createdAt: new Date(),
        },
      ];

      const result = await service.cancelOffer('user-1', 'offer-1');

      expect(result).toEqual({ success: true });
      // L'offre doit être marquée 'cancelled'
      expect(updateCalls.some((c) => c.table === 'marketOffers' && c.values.status === 'cancelled')).toBe(
        true,
      );
      // Les ressources doivent être restaurées sur la planète
      expect(updateCalls.some((c) => c.table === 'planets')).toBe(true);
      // Le job d'expiration est annulé
      expect(mockQueueRemove).toHaveBeenCalledWith('market-expire-offer-1');
    });

    it("refuse si l'offre appartient à un autre utilisateur", async () => {
      // Pas d'offre matchant (ownership filter inclus dans la requête)
      offers = [];

      await expect(service.cancelOffer('user-1', 'offer-x')).rejects.toThrow(
        'Offre non trouvée ou non annulable',
      );
    });

    it("refuse si l'offre est déjà soldée/annulée", async () => {
      offers = []; // requête filtre status='active' donc retourne vide

      await expect(service.cancelOffer('user-1', 'offer-sold')).rejects.toThrow(
        'Offre non trouvée ou non annulable',
      );
      // Pas de queue.remove ni d'update planets
      expect(mockQueueRemove).not.toHaveBeenCalled();
    });
  });

  // ── listOffers ──────────────────────────────────────────────────

  describe('listOffers()', () => {
    it("retourne une liste vide quand il n'y a pas d'offre", async () => {
      offers = [];
      const result = await service.listOffers('user-1', 'planet-1');
      expect(result.offers).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('formate correctement les offres retournées', async () => {
      // Simule une offre déjà jointe avec les coords vendeur via un override
      const fakeJoinResult = [
        {
          offer: {
            id: 'offer-99',
            sellerId: 'seller-x',
            planetId: 'planet-x',
            resourceType: 'silicium',
            quantity: '500',
            priceMinerai: '250',
            priceSilicium: '0',
            priceHydrogene: '0',
            status: 'active',
            expiresAt: new Date('2099-01-01T00:00:00Z'),
            createdAt: new Date('2099-01-01T00:00:00Z'),
          },
          sellerGalaxy: 2,
          sellerSystem: 5,
          sellerPosition: 7,
        },
      ];

      // Override le mock pour la requête de listOffers (qui utilise innerJoin)
      mockDbSelect.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(fakeJoinResult),
              }),
            }),
          }),
        }),
      }));

      const result = await service.listOffers('user-1', 'planet-1');
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0]).toMatchObject({
        id: 'offer-99',
        resourceType: 'silicium',
        quantity: 500,
        priceMinerai: 250,
        sellerCoords: { galaxy: 2, system: 5, position: 7 },
      });
    });

    it('retourne un nextCursor quand il y a plus de résultats que la limite', async () => {
      const fakeRows = Array.from({ length: 21 }, (_, i) => ({
        offer: {
          id: `offer-${i}`,
          sellerId: 'seller-x',
          planetId: 'planet-x',
          resourceType: 'minerai',
          quantity: '100',
          priceMinerai: '0',
          priceSilicium: '50',
          priceHydrogene: '0',
          status: 'active',
          expiresAt: new Date(`2099-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
          createdAt: new Date(`2099-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
        },
        sellerGalaxy: 1,
        sellerSystem: 1,
        sellerPosition: i + 1,
      }));

      mockDbSelect.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue(fakeRows),
              }),
            }),
          }),
        }),
      }));

      const result = await service.listOffers('user-1', 'planet-1', { limit: 20 });
      expect(result.offers).toHaveLength(20);
      expect(result.nextCursor).toBeDefined();
    });
  });

  // ── myOffers ────────────────────────────────────────────────────

  describe('myOffers()', () => {
    it("retourne les offres de l'utilisateur sauf les annulées", async () => {
      // Le service filtre via WHERE ; on simule le résultat post-filtre
      const fakeRows: FakeOffer[] = [
        {
          id: 'mine-1',
          sellerId: 'user-1',
          planetId: 'planet-1',
          resourceType: 'minerai',
          quantity: '300',
          priceMinerai: '0',
          priceSilicium: '100',
          priceHydrogene: '0',
          status: 'active',
          expiresAt: new Date('2099-01-01T00:00:00Z'),
          createdAt: new Date('2099-01-01T00:00:00Z'),
          fleetEventId: null,
        },
        {
          id: 'mine-2',
          sellerId: 'user-1',
          planetId: 'planet-1',
          resourceType: 'silicium',
          quantity: '500',
          priceMinerai: '250',
          priceSilicium: '0',
          priceHydrogene: '0',
          status: 'expired',
          expiresAt: new Date('2099-01-02T00:00:00Z'),
          createdAt: new Date('2099-01-02T00:00:00Z'),
          fleetEventId: null,
        },
      ];

      mockDbSelect.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(fakeRows),
          }),
        }),
      }));

      const result = await service.myOffers('user-1');
      expect(result).toHaveLength(2);
      expect(result.map((o) => o.id).sort()).toEqual(['mine-1', 'mine-2']);
      expect(result.map((o) => o.status)).toEqual(expect.arrayContaining(['active', 'expired']));
      // Pas de cancelled (filtre WHERE) — on vérifie via le payload retourné
      expect(result.find((o) => o.status === 'cancelled')).toBeUndefined();
    });

    it("retourne un tableau vide si l'utilisateur n'a aucune offre", async () => {
      mockDbSelect.mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }));

      const result = await service.myOffers('user-no-offers');
      expect(result).toEqual([]);
    });
  });

  // ── processExpiration ──────────────────────────────────────────

  describe('processExpiration()', () => {
    it("ne fait rien si l'offre n'est plus active (déjà soldée/annulée)", async () => {
      offers = []; // la requête filtre status='active'

      await service.processExpiration('offer-x');

      // Pas de mise à jour, pas de notification
      expect(mockRedisPublish).not.toHaveBeenCalled();
      expect(updateCalls).toEqual([]);
    });

    it('rembourse les ressources au seller et marque l\'offre expirée', async () => {
      offers = [
        {
          id: 'offer-exp',
          sellerId: 'user-1',
          planetId: 'planet-1',
          resourceType: 'hydrogene',
          quantity: '750',
          priceMinerai: '0',
          priceSilicium: '0',
          priceHydrogene: '300',
          status: 'active',
          expiresAt: new Date(),
          createdAt: new Date(),
        },
      ];

      await service.processExpiration('offer-exp');

      // Mise à jour planète (restauration ressources)
      const planetUpdate = updateCalls.find((c) => c.table === 'planets');
      expect(planetUpdate).toBeDefined();
      expect(planetUpdate!.values.hydrogene).toBeDefined();

      // Status -> expired
      const offerUpdate = updateCalls.find(
        (c) => c.table === 'marketOffers' && c.values.status === 'expired',
      );
      expect(offerUpdate).toBeDefined();

      // Notification au seller
      expect(mockRedisPublish).toHaveBeenCalledWith(
        'notifications:user-1',
        expect.stringContaining('market-offer-expired'),
      );
    });
  });

  // ── Commission / talent context ────────────────────────────────

  describe('getCommissionConfig (via createOffer)', () => {
    it("applique le bonus talent 'market_fee' pour réduire la commission", async () => {
      // Talent : -50% (market_fee = 1 → percent / 2)
      mockComputeTalentContext.mockResolvedValueOnce({ market_fee: 1 });

      await service.createOffer('user-1', 'planet-1', {
        resourceType: 'minerai',
        quantity: 1000,
        priceMinerai: 0,
        priceSilicium: 500,
        priceHydrogene: 0,
      });

      // Commission de base 5% → divisée par (1+1)=2 → 2.5% → ceil(1000*2.5/100)=25
      expect(mockSpendResources).toHaveBeenCalledWith('planet-1', 'user-1', {
        minerai: 1025, // 1000 + 25
        silicium: 0,
        hydrogene: 0,
      });
    });

    it("applique la commission par défaut (5%) si aucun talent n'est actif", async () => {
      mockComputeTalentContext.mockResolvedValueOnce({});

      await service.createOffer('user-1', 'planet-1', {
        resourceType: 'silicium',
        quantity: 200,
        priceMinerai: 100,
        priceSilicium: 0,
        priceHydrogene: 0,
      });

      // 5% de 200 = 10, donc 210 silicium dépensés
      expect(mockSpendResources).toHaveBeenCalledWith('planet-1', 'user-1', {
        minerai: 0,
        silicium: 210,
        hydrogene: 0,
      });
    });
  });
});

import { eq, and, ne, desc, lt, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Queue } from 'bullmq';
import { marketOffers, planets, planetBuildings, fleetEvents } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';
import { maxMarketOffers } from '@ogame-clone/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import { publishNotification } from '../notification/notification.publisher.js';
import type Redis from 'ioredis';

export function createMarketService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  gameConfigService: GameConfigService,
  marketQueue: Queue,
  redis: Redis,
) {
  async function getMarketLevel(planetId: string): Promise<number> {
    const [row] = await db
      .select({ level: planetBuildings.level })
      .from(planetBuildings)
      .where(
        and(
          eq(planetBuildings.planetId, planetId),
          eq(planetBuildings.buildingId, 'galacticMarket'),
        ),
      )
      .limit(1);
    return row?.level ?? 0;
  }

  async function hasHostileInbound(planetId: string): Promise<boolean> {
    const [planet] = await db
      .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
      .from(planets)
      .where(eq(planets.id, planetId))
      .limit(1);
    if (!planet) return false;

    const [hostile] = await db
      .select({ id: fleetEvents.id })
      .from(fleetEvents)
      .where(
        and(
          eq(fleetEvents.targetGalaxy, planet.galaxy),
          eq(fleetEvents.targetSystem, planet.system),
          eq(fleetEvents.targetPosition, planet.position),
          eq(fleetEvents.status, 'active'),
          eq(fleetEvents.phase, 'outbound'),
          sql`${fleetEvents.detectedAt} IS NOT NULL`,
        ),
      )
      .limit(1);
    return !!hostile;
  }

  return {
    async createOffer(userId: string, planetId: string, input: {
      resourceType: 'minerai' | 'silicium' | 'hydrogene';
      quantity: number;
      priceMinerai: number;
      priceSilicium: number;
      priceHydrogene: number;
    }) {
      const marketLevel = await getMarketLevel(planetId);
      if (marketLevel < 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Marché Galactique requis' });
      }

      // Check max offers (active + reserved both count against the limit)
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.sellerId, userId),
            sql`${marketOffers.status} IN ('active', 'reserved')`,
          ),
        );
      if (count >= maxMarketOffers(marketLevel)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Nombre maximum d'offres atteint (${maxMarketOffers(marketLevel)})` });
      }

      // Check hostile inbound
      if (await hasHostileInbound(planetId)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Impossible de créer une offre pendant une attaque' });
      }

      // Validate price (at least one component > 0)
      if (input.priceMinerai <= 0 && input.priceSilicium <= 0 && input.priceHydrogene <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le prix doit être supérieur à 0' });
      }

      if (input.quantity <= 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'La quantité doit être supérieure à 0' });
      }

      // Deduct resources (escrow)
      const cost = { minerai: 0, silicium: 0, hydrogene: 0 };
      cost[input.resourceType] = input.quantity;
      await resourceService.spendResources(planetId, userId, cost);

      // Calculate expiration
      const config = await gameConfigService.getFullConfig();
      const durationHours = Number(config.universe.market_offer_duration_hours) || 48;
      const expiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

      // Create offer
      const [offer] = await db
        .insert(marketOffers)
        .values({
          sellerId: userId,
          planetId,
          resourceType: input.resourceType,
          quantity: String(input.quantity),
          priceMinerai: String(input.priceMinerai),
          priceSilicium: String(input.priceSilicium),
          priceHydrogene: String(input.priceHydrogene),
          status: 'active',
          expiresAt,
        })
        .returning();

      // Schedule expiration job
      await marketQueue.add(
        'market-expire',
        { offerId: offer.id },
        { delay: durationHours * 60 * 60 * 1000, jobId: `market-expire-${offer.id}` },
      );

      return offer;
    },

    async cancelOffer(userId: string, offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.id, offerId),
            eq(marketOffers.sellerId, userId),
            eq(marketOffers.status, 'active'),
          ),
        )
        .limit(1);

      if (!offer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non trouvée ou non annulable' });
      }

      // Restore escrowed resources to seller's planet
      const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
      if (planet) {
        const updates: Record<string, string> = {};
        updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
        await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
      }

      // Update status
      await db
        .update(marketOffers)
        .set({ status: 'cancelled' })
        .where(eq(marketOffers.id, offerId));

      // Cancel expiration job
      await marketQueue.remove(`market-expire-${offerId}`);

      return { success: true };
    },

    async listOffers(userId: string, planetId: string, options?: {
      resourceType?: string;
      cursor?: string;
      limit?: number;
    }) {
      const limit = options?.limit ?? 20;

      // Get buyer's planet for distance calculation
      const [buyerPlanet] = await db
        .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
        .from(planets)
        .where(eq(planets.id, planetId))
        .limit(1);

      const conditions = [
        eq(marketOffers.status, 'active'),
        ne(marketOffers.sellerId, userId),
      ];

      if (options?.resourceType) {
        conditions.push(eq(marketOffers.resourceType, options.resourceType as any));
      }

      if (options?.cursor) {
        conditions.push(lt(marketOffers.createdAt, new Date(options.cursor)));
      }

      const offers = await db
        .select({
          offer: marketOffers,
          sellerGalaxy: planets.galaxy,
          sellerSystem: planets.system,
          sellerPosition: planets.position,
        })
        .from(marketOffers)
        .innerJoin(planets, eq(marketOffers.planetId, planets.id))
        .where(and(...conditions))
        .orderBy(desc(marketOffers.createdAt))
        .limit(limit + 1);

      const hasMore = offers.length > limit;
      const results = hasMore ? offers.slice(0, limit) : offers;
      const nextCursor = hasMore ? results[results.length - 1]?.offer.createdAt.toISOString() : undefined;

      return {
        offers: results.map((r) => ({
          id: r.offer.id,
          resourceType: r.offer.resourceType,
          quantity: Number(r.offer.quantity),
          priceMinerai: Number(r.offer.priceMinerai),
          priceSilicium: Number(r.offer.priceSilicium),
          priceHydrogene: Number(r.offer.priceHydrogene),
          sellerCoords: { galaxy: r.sellerGalaxy, system: r.sellerSystem, position: r.sellerPosition },
          expiresAt: r.offer.expiresAt.toISOString(),
          createdAt: r.offer.createdAt.toISOString(),
        })),
        nextCursor,
      };
    },

    async myOffers(userId: string) {
      const offers = await db
        .select()
        .from(marketOffers)
        .where(and(eq(marketOffers.sellerId, userId), ne(marketOffers.status, 'cancelled')))
        .orderBy(desc(marketOffers.createdAt));

      return offers.map((o) => ({
        id: o.id,
        resourceType: o.resourceType,
        quantity: Number(o.quantity),
        priceMinerai: Number(o.priceMinerai),
        priceSilicium: Number(o.priceSilicium),
        priceHydrogene: Number(o.priceHydrogene),
        status: o.status,
        fleetEventId: o.fleetEventId,
        expiresAt: o.expiresAt.toISOString(),
        createdAt: o.createdAt.toISOString(),
      }));
    },

    // Called by market worker on offer expiration
    async processExpiration(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(and(eq(marketOffers.id, offerId), eq(marketOffers.status, 'active')))
        .limit(1);

      if (!offer) return; // Already sold/cancelled/reserved

      // Restore resources to seller's planet
      const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
      if (planet) {
        const updates: Record<string, string> = {};
        updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
        await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
      }

      await db
        .update(marketOffers)
        .set({ status: 'expired' })
        .where(eq(marketOffers.id, offerId));

      // Notify seller
      publishNotification(redis, offer.sellerId, {
        type: 'market-offer-expired',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
        },
      });
    },

    // Called by market worker on reservation expiration
    async processReservationExpiration(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(and(eq(marketOffers.id, offerId), eq(marketOffers.status, 'reserved')))
        .limit(1);

      if (!offer || offer.fleetEventId) return; // Fleet already sent or offer no longer reserved

      await db
        .update(marketOffers)
        .set({
          status: 'active',
          reservedBy: null,
          reservedAt: null,
        })
        .where(eq(marketOffers.id, offerId));

      // Notify buyer
      if (offer.reservedBy) {
        publishNotification(redis, offer.reservedBy, {
          type: 'market-reservation-expired',
          payload: { offerId: offer.id },
        });
      }
    },

    // Called by trade handler on arrival to notify seller
    async notifySold(offerId: string) {
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(eq(marketOffers.id, offerId))
        .limit(1);

      if (!offer) return;

      publishNotification(redis, offer.sellerId, {
        type: 'market-offer-sold',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
          payment: {
            minerai: Number(offer.priceMinerai),
            silicium: Number(offer.priceSilicium),
            hydrogene: Number(offer.priceHydrogene),
          },
        },
      });
    },
  };
}

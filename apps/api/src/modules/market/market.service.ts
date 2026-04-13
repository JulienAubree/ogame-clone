import { eq, and, ne, desc, lt, sql, isNotNull, isNull } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import type { Queue } from 'bullmq';
import { marketOffers, planets, planetBuildings, fleetEvents, explorationReports, discoveredBiomes, discoveredPositions, users } from '@exilium/db';
import type { Database } from '@exilium/db';
import { maxMarketOffers, calculateSellerCommission } from '@exilium/game-engine';
import type { createResourceService } from '../resource/resource.service.js';
import type { GameConfigService } from '../admin/game-config.service.js';
import type { createExiliumService } from '../exilium/exilium.service.js';
import type { createDailyQuestService } from '../daily-quest/daily-quest.service.js';
import type { createGameEventService } from '../game-event/game-event.service.js';
import { publishNotification } from '../notification/notification.publisher.js';
import type Redis from 'ioredis';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;

export function createMarketService(
  db: Database,
  resourceService: ReturnType<typeof createResourceService>,
  gameConfigService: GameConfigService,
  marketQueue: Queue,
  redis: Redis,
  dailyQuestService?: ReturnType<typeof createDailyQuestService>,
  exiliumService?: ReturnType<typeof createExiliumService>,
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> },
  gameEventService?: ReturnType<typeof createGameEventService>,
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

  async function getCommissionConfig(userId: string) {
    const config = await gameConfigService.getFullConfig();
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;
    const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};
    const adjustedPercent = commissionPercent / (1 + (talentCtx['market_fee'] ?? 0));
    const durationHours = Number(config.universe.market_offer_duration_hours) || 48;
    return { adjustedPercent, durationHours };
  }

  async function countActiveOffers(userId: string): Promise<number> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketOffers)
      .where(
        and(
          eq(marketOffers.sellerId, userId),
          sql`${marketOffers.status} IN ('active', 'reserved')`,
        ),
      );
    return count;
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
      const count = await countActiveOffers(userId);
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

      // Calculate commission (paid by seller, non-refundable)
      const { adjustedPercent, durationHours } = await getCommissionConfig(userId);
      const commission = calculateSellerCommission(input.quantity, adjustedPercent);

      // Deduct resources (escrow + commission destroyed)
      const cost = { minerai: 0, silicium: 0, hydrogene: 0 };
      cost[input.resourceType] = input.quantity + commission;
      await resourceService.spendResources(planetId, userId, cost);

      // Calculate expiration
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

      // Only restore resources for resource offers (not report offers)
      if (offer.resourceType && offer.quantity) {
        const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
        if (planet) {
          const updates: Record<string, string> = {};
          updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
          await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
        }
      }

      // For report offers, restore the report to inventory
      if (offer.explorationReportId) {
        await db
          .update(explorationReports)
          .set({ status: 'inventory' })
          .where(eq(explorationReports.id, offer.explorationReportId));
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

      const conditions = [
        eq(marketOffers.status, 'active'),
        ne(marketOffers.sellerId, userId),
        isNull(marketOffers.explorationReportId),
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
          resourceType: r.offer.resourceType!,
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
        .where(and(
          eq(marketOffers.sellerId, userId),
          ne(marketOffers.status, 'cancelled'),
          isNull(marketOffers.explorationReportId),
        ))
        .orderBy(desc(marketOffers.createdAt));

      return offers.map((o) => ({
        id: o.id,
        resourceType: o.resourceType!,
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

      // For report offers: return report to inventory, no resource restoration
      if (offer.explorationReportId) {
        await db
          .update(explorationReports)
          .set({ status: 'inventory' })
          .where(eq(explorationReports.id, offer.explorationReportId));

        await db
          .update(marketOffers)
          .set({ status: 'expired' })
          .where(eq(marketOffers.id, offerId));

        publishNotification(redis, offer.sellerId, {
          type: 'market-offer-expired',
          payload: {
            offerId: offer.id,
            resourceType: null,
            quantity: null,
          },
        });
        return;
      }

      // Resource offers: restore resources to seller's planet
      if (offer.resourceType && offer.quantity) {
        const [planet] = await db.select().from(planets).where(eq(planets.id, offer.planetId)).limit(1);
        if (planet) {
          const updates: Record<string, string> = {};
          updates[offer.resourceType] = String(Number((planet as any)[offer.resourceType]) + Number(offer.quantity));
          await db.update(planets).set(updates).where(eq(planets.id, offer.planetId));
        }
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

    // ── Report offer methods ────────────────────────────────────────────

    async listReportOffers(userId: string, options?: {
      galaxy?: number;
      system?: number;
      minRarity?: string;
      cursor?: string;
      limit?: number;
    }) {
      const limit = options?.limit ?? 20;

      const conditions: ReturnType<typeof eq>[] = [
        eq(marketOffers.status, 'active'),
        ne(marketOffers.sellerId, userId),
        isNotNull(marketOffers.explorationReportId),
      ];

      if (options?.galaxy !== undefined) {
        conditions.push(eq(explorationReports.galaxy, options.galaxy));
      }
      if (options?.system !== undefined) {
        conditions.push(eq(explorationReports.system, options.system));
      }
      if (options?.minRarity) {
        const minIdx = RARITY_ORDER.indexOf(options.minRarity as typeof RARITY_ORDER[number]);
        if (minIdx > 0) {
          const validRarities = RARITY_ORDER.slice(minIdx);
          conditions.push(sql`${explorationReports.maxRarity} IN (${sql.join(validRarities.map(r => sql`${r}`), sql`, `)})`);
        }
      }
      if (options?.cursor) {
        conditions.push(lt(marketOffers.createdAt, new Date(options.cursor)));
      }

      const offers = await db
        .select({
          offerId: marketOffers.id,
          galaxy: explorationReports.galaxy,
          system: explorationReports.system,
          position: explorationReports.position,
          planetClassId: explorationReports.planetClassId,
          biomeCount: explorationReports.biomeCount,
          maxRarity: explorationReports.maxRarity,
          isComplete: explorationReports.isComplete,
          priceMinerai: marketOffers.priceMinerai,
          priceSilicium: marketOffers.priceSilicium,
          priceHydrogene: marketOffers.priceHydrogene,
          sellerUsername: users.username,
          expiresAt: marketOffers.expiresAt,
          createdAt: marketOffers.createdAt,
          reportBiomes: explorationReports.biomes,
        })
        .from(marketOffers)
        .innerJoin(explorationReports, eq(marketOffers.explorationReportId, explorationReports.id))
        .innerJoin(users, eq(explorationReports.creatorId, users.id))
        .where(and(...conditions))
        .orderBy(desc(marketOffers.createdAt))
        .limit(limit + 1);

      const hasMore = offers.length > limit;
      const results = hasMore ? offers.slice(0, limit) : offers;
      const nextCursor = hasMore ? results[results.length - 1]?.createdAt.toISOString() : undefined;

      // For each offer, check how many biomes the buyer already knows at the position
      const enriched = await Promise.all(
        results.map(async (r) => {
          const biomes = r.reportBiomes as Array<{ id: string }>;
          let knownBiomeCount = 0;

          if (biomes.length > 0) {
            const [countResult] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(discoveredBiomes)
              .where(
                and(
                  eq(discoveredBiomes.userId, userId),
                  eq(discoveredBiomes.galaxy, r.galaxy),
                  eq(discoveredBiomes.system, r.system),
                  eq(discoveredBiomes.position, r.position),
                  sql`${discoveredBiomes.biomeId} IN (${sql.join(biomes.map(b => sql`${b.id}`), sql`, `)})`,
                ),
              );
            knownBiomeCount = countResult?.count ?? 0;
          }

          return {
            offerId: r.offerId,
            galaxy: r.galaxy,
            system: r.system,
            planetClassId: r.planetClassId,
            biomeCount: r.biomeCount,
            maxRarity: r.maxRarity,
            isComplete: r.isComplete,
            priceMinerai: Number(r.priceMinerai),
            priceSilicium: Number(r.priceSilicium),
            priceHydrogene: Number(r.priceHydrogene),
            sellerUsername: r.sellerUsername,
            expiresAt: r.expiresAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
            knownBiomeCount,
          };
        }),
      );

      return { offers: enriched, nextCursor };
    },

    async createReportOffer(userId: string, planetId: string, input: {
      reportId: string;
      priceMinerai: number;
      priceSilicium: number;
      priceHydrogene: number;
    }) {
      const { offer, durationHours } = await db.transaction(async (tx) => {
        // 1. Lock and load the report (FOR UPDATE prevents TOCTOU race)
        const [report] = await tx
          .select()
          .from(explorationReports)
          .where(
            and(
              eq(explorationReports.id, input.reportId),
              eq(explorationReports.ownerId, userId),
            ),
          )
          .for('update')
          .limit(1);

        if (!report || report.status !== 'inventory') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Rapport non trouvé ou non disponible' });
        }

        // 2. Check market building level
        const marketLevel = await getMarketLevel(planetId);
        if (marketLevel < 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Marché Galactique requis' });
        }

        // 3. Check max offers (report offers count against the same limit)
        const count = await countActiveOffers(userId);
        if (count >= maxMarketOffers(marketLevel)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: `Nombre maximum d'offres atteint (${maxMarketOffers(marketLevel)})` });
        }

        // 4. Validate price (at least one > 0)
        if (input.priceMinerai <= 0 && input.priceSilicium <= 0 && input.priceHydrogene <= 0) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le prix doit être supérieur à 0' });
        }

        // 5. Calculate commission: % of each price component independently
        const { adjustedPercent, durationHours: durHours } = await getCommissionConfig(userId);
        const commissionMinerai = calculateSellerCommission(input.priceMinerai, adjustedPercent);
        const commissionSilicium = calculateSellerCommission(input.priceSilicium, adjustedPercent);
        const commissionHydrogene = calculateSellerCommission(input.priceHydrogene, adjustedPercent);

        // 6. Deduct commission from planet (uses main db connection, same pattern as buyReport)
        await resourceService.spendResources(planetId, userId, {
          minerai: commissionMinerai,
          silicium: commissionSilicium,
          hydrogene: commissionHydrogene,
        });

        // 7. Update report status to listed
        await tx
          .update(explorationReports)
          .set({ status: 'listed' })
          .where(eq(explorationReports.id, input.reportId));

        // 8. Calculate expiration
        const expiresAt = new Date(Date.now() + durHours * 60 * 60 * 1000);

        // 9. Insert market offer
        const [txOffer] = await tx
          .insert(marketOffers)
          .values({
            sellerId: userId,
            planetId,
            resourceType: null,
            quantity: null,
            explorationReportId: input.reportId,
            priceMinerai: String(input.priceMinerai),
            priceSilicium: String(input.priceSilicium),
            priceHydrogene: String(input.priceHydrogene),
            status: 'active',
            expiresAt,
          })
          .returning();

        return { offer: txOffer, durationHours: durHours };
      });

      // 10. Schedule expiration job (outside transaction — idempotent)
      await marketQueue.add(
        'market-expire',
        { offerId: offer.id },
        { delay: durationHours * 60 * 60 * 1000, jobId: `market-expire-${offer.id}` },
      );

      return offer;
    },

    async buyReport(userId: string, planetId: string, offerId: string) {
      return db.transaction(async (tx) => {
        // 1. Load the offer with SELECT FOR UPDATE (prevent race condition)
        const [offer] = await tx
          .select()
          .from(marketOffers)
          .where(
            and(
              eq(marketOffers.id, offerId),
              eq(marketOffers.status, 'active'),
              isNotNull(marketOffers.explorationReportId),
            ),
          )
          .for('update')
          .limit(1);

        if (!offer) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non disponible ou deja vendue' });
        }

        if (offer.sellerId === userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Impossible d\'acheter sa propre offre' });
        }

        // 2. Load the linked exploration report
        const [report] = await tx
          .select()
          .from(explorationReports)
          .where(eq(explorationReports.id, offer.explorationReportId!))
          .limit(1);

        if (!report) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Rapport d\'exploration introuvable' });
        }

        const reportBiomes = report.biomes as Array<{ id: string; name: string; rarity: string; effects: unknown }>;

        // 3. Check the buyer doesn't already know all biomes in the report
        if (reportBiomes.length > 0) {
          const [knownResult] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(discoveredBiomes)
            .where(
              and(
                eq(discoveredBiomes.userId, userId),
                eq(discoveredBiomes.galaxy, report.galaxy),
                eq(discoveredBiomes.system, report.system),
                eq(discoveredBiomes.position, report.position),
                sql`${discoveredBiomes.biomeId} IN (${sql.join(reportBiomes.map(b => sql`${b.id}`), sql`, `)})`,
              ),
            );
          if ((knownResult?.count ?? 0) >= reportBiomes.length) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Vous connaissez deja toutes les informations de ce rapport',
            });
          }
        } else {
          // Report with 0 biomes — check if position is already known
          const [posKnown] = await tx
            .select({ userId: discoveredPositions.userId })
            .from(discoveredPositions)
            .where(
              and(
                eq(discoveredPositions.userId, userId),
                eq(discoveredPositions.galaxy, report.galaxy),
                eq(discoveredPositions.system, report.system),
                eq(discoveredPositions.position, report.position),
              ),
            )
            .limit(1);
          if (posKnown) {
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: 'Vous connaissez deja toutes les informations de ce rapport',
            });
          }
        }

        // 4. Deduct payment from buyer's planet
        const price = {
          minerai: Number(offer.priceMinerai),
          silicium: Number(offer.priceSilicium),
          hydrogene: Number(offer.priceHydrogene),
        };
        await resourceService.spendResources(planetId, userId, price);

        // 5. Credit payment to seller's planet
        const [sellerPlanet] = await tx
          .select()
          .from(planets)
          .where(eq(planets.id, offer.planetId))
          .limit(1);

        if (sellerPlanet) {
          await tx
            .update(planets)
            .set({
              minerai: String(Number(sellerPlanet.minerai) + price.minerai),
              silicium: String(Number(sellerPlanet.silicium) + price.silicium),
              hydrogene: String(Number(sellerPlanet.hydrogene) + price.hydrogene),
            })
            .where(eq(planets.id, offer.planetId));
        }

        // 6. Write discovery data for the buyer
        // Upsert discovered_positions
        await tx
          .insert(discoveredPositions)
          .values({
            userId,
            galaxy: report.galaxy,
            system: report.system,
            position: report.position,
          })
          .onConflictDoNothing();

        // Upsert discovered_biomes for each biome in the report
        if (reportBiomes.length > 0) {
          await tx
            .insert(discoveredBiomes)
            .values(
              reportBiomes.map((b) => ({
                userId,
                galaxy: report.galaxy,
                system: report.system,
                position: report.position,
                biomeId: b.id,
              })),
            )
            .onConflictDoNothing();
        }

        // 7. Update report: status -> sold (ownerId stays with the seller —
        // the buyer consumes the data, they don't "own" the report object.
        // This prevents the bought report from showing in the buyer's
        // "Mes rapports" inventory.)
        await tx
          .update(explorationReports)
          .set({ status: 'sold' })
          .where(eq(explorationReports.id, report.id));

        // 8. Update offer: status -> sold
        await tx
          .update(marketOffers)
          .set({ status: 'sold' })
          .where(eq(marketOffers.id, offerId));

        // 9. Cancel the expiration job (outside transaction is fine — idempotent)
        marketQueue.remove(`market-expire-${offerId}`).catch(() => {});

        // 10. Send notifications
        // Fetch usernames for notification payloads
        const [buyer] = await tx
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1);
        const [seller] = await tx
          .select({ username: users.username })
          .from(users)
          .where(eq(users.id, offer.sellerId))
          .limit(1);

        const buyerUsername = buyer?.username ?? 'Inconnu';
        const sellerUsername = seller?.username ?? 'Inconnu';

        // Notify seller: report-sold
        publishNotification(redis, offer.sellerId, {
          type: 'report-sold',
          payload: {
            buyerUsername,
            galaxy: report.galaxy,
            system: report.system,
            position: report.position,
            price,
          },
        });

        if (gameEventService) {
          gameEventService.insert(offer.sellerId, offer.planetId, 'report-sold', {
            buyerUsername,
            galaxy: report.galaxy,
            system: report.system,
            position: report.position,
            price,
          }).catch(() => {});
        }

        // Notify buyer: report-purchased
        publishNotification(redis, userId, {
          type: 'report-purchased',
          payload: {
            sellerUsername,
            galaxy: report.galaxy,
            system: report.system,
            position: report.position,
            biomeCount: reportBiomes.length,
          },
        });

        if (gameEventService) {
          gameEventService.insert(userId, planetId, 'report-purchased', {
            sellerUsername,
            galaxy: report.galaxy,
            system: report.system,
            position: report.position,
            biomeCount: reportBiomes.length,
          }).catch(() => {});
        }

        return { success: true };
      });
    },

    async cancelReportOffer(userId: string, reportId: string) {
      // 1. Find the active offer for this report
      const [offer] = await db
        .select()
        .from(marketOffers)
        .where(
          and(
            eq(marketOffers.sellerId, userId),
            eq(marketOffers.explorationReportId, reportId),
            eq(marketOffers.status, 'active'),
          ),
        )
        .limit(1);

      if (!offer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non trouvée ou non annulable' });
      }

      // 2. Load the linked report
      const [report] = await db
        .select()
        .from(explorationReports)
        .where(eq(explorationReports.id, offer.explorationReportId!))
        .limit(1);

      if (!report) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Rapport d\'exploration introuvable' });
      }

      // 3. Update report status back to inventory
      await db
        .update(explorationReports)
        .set({ status: 'inventory' })
        .where(eq(explorationReports.id, report.id));

      // 4. Update offer status to cancelled
      await db
        .update(marketOffers)
        .set({ status: 'cancelled' })
        .where(eq(marketOffers.id, offer.id));

      // 5. Cancel expiration job
      await marketQueue.remove(`market-expire-${offer.id}`);

      // 6. Commission is NOT refunded (already destroyed at listing time)
      return { success: true };
    },

  };
}

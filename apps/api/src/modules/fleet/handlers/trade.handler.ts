import { eq, and, ne } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { marketOffers, planets } from '@exilium/db';
import { totalCargoCapacity } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { publishNotification } from '../../notification/notification.publisher.js';

export class TradeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    if (!input.tradeId || !input.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'tradeId requis pour une mission commerce' });
    }

    const userId = input.userId;

    // Atomic reservation: UPDATE...WHERE status='active' AND sellerId != userId RETURNING
    const [offer] = await ctx.db
      .update(marketOffers)
      .set({
        status: 'reserved',
        reservedBy: userId,
        reservedAt: new Date(),
      })
      .where(
        and(
          eq(marketOffers.id, input.tradeId),
          eq(marketOffers.status, 'active'),
          ne(marketOffers.sellerId, userId),
        ),
      )
      .returning();

    if (!offer) {
      const [existing] = await ctx.db
        .select({ sellerId: marketOffers.sellerId, status: marketOffers.status })
        .from(marketOffers)
        .where(eq(marketOffers.id, input.tradeId))
        .limit(1);
      if (existing?.sellerId === userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Impossible d\'acheter sa propre offre' });
      }
      if (existing?.status === 'reserved') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Offre déjà réservée par un autre joueur' });
      }
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non disponible' });
    }

    // Verify coordinates match seller's planet
    const [sellerPlanet] = await ctx.db
      .select({ name: planets.name, galaxy: planets.galaxy, system: planets.system, position: planets.position })
      .from(planets)
      .where(eq(planets.id, offer.planetId))
      .limit(1);

    if (!sellerPlanet) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Planète du vendeur introuvable' });
    }

    if (
      input.targetGalaxy !== sellerPlanet.galaxy ||
      input.targetSystem !== sellerPlanet.system ||
      input.targetPosition !== sellerPlanet.position
    ) {
      // Rollback reservation
      await ctx.db
        .update(marketOffers)
        .set({ status: 'active', reservedBy: null, reservedAt: null })
        .where(eq(marketOffers.id, input.tradeId));
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coordonnées ne correspondent pas à l\'offre' });
    }

    // Verify cargo covers price (commission is now paid by seller at offer creation)
    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };

    const cargoMinerai = input.mineraiCargo ?? 0;
    const cargoSilicium = input.siliciumCargo ?? 0;
    const cargoHydrogene = input.hydrogeneCargo ?? 0;

    if (cargoMinerai < price.minerai || cargoSilicium < price.silicium || cargoHydrogene < price.hydrogene) {
      // Rollback reservation
      await ctx.db
        .update(marketOffers)
        .set({ status: 'active', reservedBy: null, reservedAt: null })
        .where(eq(marketOffers.id, input.tradeId));
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cargo insuffisant. Requis: ${price.minerai} Mi, ${price.silicium} Si, ${price.hydrogene} H2`,
      });
    }

    // Verify fleet cargo capacity can handle return merchandise
    const shipStatsMap = buildShipStatsMap(config);
    const fleetCargo = totalCargoCapacity(input.ships, shipStatsMap);
    const merchandiseQty = Number(offer.quantity);
    if (fleetCargo < merchandiseQty) {
      // Rollback reservation
      await ctx.db
        .update(marketOffers)
        .set({ status: 'active', reservedBy: null, reservedAt: null })
        .where(eq(marketOffers.id, input.tradeId));
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Capacité de fret insuffisante pour rapatrier la marchandise (${merchandiseQty.toLocaleString('fr-FR')} ${offer.resourceType}). Capacité: ${fleetCargo.toLocaleString('fr-FR')}`,
      });
    }

    // Notify seller
    if (ctx.redis) {
      publishNotification(ctx.redis, offer.sellerId, {
        type: 'market-offer-reserved',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
          planetName: sellerPlanet.name ?? 'Planète inconnue',
        },
      });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const tradeId = fleetEvent.tradeId;
    if (!tradeId) {
      return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
    }

    const [offer] = await ctx.db
      .select()
      .from(marketOffers)
      .where(and(eq(marketOffers.id, tradeId), eq(marketOffers.status, 'reserved')))
      .limit(1);

    if (!offer) {
      // Offer was cancelled/expired — return with payment
      return {
        scheduleReturn: true,
        cargo: {
          minerai: Number(fleetEvent.mineraiCargo),
          silicium: Number(fleetEvent.siliciumCargo),
          hydrogene: Number(fleetEvent.hydrogeneCargo),
        },
      };
    }

    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    // Commission was already deducted from buyer at purchase time (economic sink)

    // Credit seller's planet with price (NOT commission)
    const [sellerPlanet] = await ctx.db
      .select()
      .from(planets)
      .where(eq(planets.id, offer.planetId))
      .limit(1);

    if (sellerPlanet) {
      await ctx.db
        .update(planets)
        .set({
          minerai: String(Number(sellerPlanet.minerai) + price.minerai),
          silicium: String(Number(sellerPlanet.silicium) + price.silicium),
          hydrogene: String(Number(sellerPlanet.hydrogene) + price.hydrogene),
        })
        .where(eq(planets.id, offer.planetId));
    }

    // Commission is destroyed (not credited anywhere — economic sink)

    // Mark offer as sold
    await ctx.db
      .update(marketOffers)
      .set({ status: 'sold' })
      .where(eq(marketOffers.id, tradeId));

    // Hook: daily quest detection for market transaction
    if (ctx.dailyQuestService) {
      ctx.dailyQuestService.processEvent({
        type: 'market:transaction_completed',
        userId: offer.sellerId,
        payload: {},
      }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
      ctx.dailyQuestService.processEvent({
        type: 'market:transaction_completed',
        userId: fleetEvent.userId,
        payload: {},
      }).catch((e) => console.warn('[daily-quest] processEvent failed:', e));
    }

    // Hook: Exilium drop for seller on market transaction
    if (ctx.exiliumService) {
      ctx.exiliumService.tryDrop(offer.sellerId, 'market', { offerId: offer.id }).catch((e) => console.warn('[exilium-drop] tryDrop failed:', e));
    }

    // Notify seller
    if (ctx.redis) {
      publishNotification(ctx.redis, offer.sellerId, {
        type: 'market-offer-sold',
        payload: {
          offerId: offer.id,
          resourceType: offer.resourceType,
          quantity: Number(offer.quantity),
          payment: price,
        },
      });
    }

    // Load merchandise into fleet cargo for return trip
    const merchandise = { minerai: 0, silicium: 0, hydrogene: 0 };
    if (offer.resourceType in merchandise) {
      merchandise[offer.resourceType as keyof typeof merchandise] = Number(offer.quantity);
    }

    return {
      scheduleReturn: true,
      cargo: merchandise,
    };
  }
}

import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { marketOffers, planets } from '@ogame-clone/db';
import { calculateCommission } from '@ogame-clone/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class TradeHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    if (!input.tradeId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'tradeId requis pour une mission commerce' });
    }

    const [offer] = await ctx.db
      .select()
      .from(marketOffers)
      .where(
        and(
          eq(marketOffers.id, input.tradeId),
          eq(marketOffers.status, 'reserved'),
        ),
      )
      .limit(1);

    if (!offer) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Offre non trouvée ou non réservée' });
    }

    // Verify coordinates match seller's planet
    const [sellerPlanet] = await ctx.db
      .select({ galaxy: planets.galaxy, system: planets.system, position: planets.position })
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
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Coordonnées ne correspondent pas à l\'offre' });
    }

    // Verify cargo covers price + commission
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;
    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    const commission = calculateCommission(price, commissionPercent);
    const requiredMinerai = price.minerai + commission.minerai;
    const requiredSilicium = price.silicium + commission.silicium;
    const requiredHydrogene = price.hydrogene + commission.hydrogene;

    const cargoMinerai = input.mineraiCargo ?? 0;
    const cargoSilicium = input.siliciumCargo ?? 0;
    const cargoHydrogene = input.hydrogeneCargo ?? 0;

    if (cargoMinerai < requiredMinerai || cargoSilicium < requiredSilicium || cargoHydrogene < requiredHydrogene) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Cargo insuffisant. Requis: ${requiredMinerai} Mi, ${requiredSilicium} Si, ${requiredHydrogene} H2`,
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

    const config = await ctx.gameConfigService.getFullConfig();
    const commissionPercent = Number(config.universe.market_commission_percent) || 5;
    const price = {
      minerai: Number(offer.priceMinerai),
      silicium: Number(offer.priceSilicium),
      hydrogene: Number(offer.priceHydrogene),
    };
    const commission = calculateCommission(price, commissionPercent);

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

    // Load merchandise into fleet cargo for return trip
    const merchandise = { minerai: 0, silicium: 0, hydrogene: 0 };
    merchandise[offer.resourceType as keyof typeof merchandise] = Number(offer.quantity);

    return {
      scheduleReturn: true,
      cargo: merchandise,
    };
  }
}

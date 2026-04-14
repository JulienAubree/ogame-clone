import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, colonizationEvents } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class ColonizeSupplyHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const [target] = await ctx.db
      .select({ id: planets.id })
      .from(planets)
      .where(and(
        eq(planets.galaxy, input.targetGalaxy),
        eq(planets.system, input.targetSystem),
        eq(planets.position, input.targetPosition),
        eq(planets.userId, input.userId!),
        eq(planets.status, 'colonizing'),
      ))
      .limit(1);

    if (!target) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune colonisation en cours a cette position' });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const config = await ctx.gameConfigService.getFullConfig();

    // Proportional boost: +5% per 2000 resources delivered, capped at 25%
    const boostPerTranche = Number(config.universe.colonization_supply_boost_per_tranche) || 0.05;
    const trancheSize = Number(config.universe.colonization_supply_tranche_size) || 2000;
    const maxBoost = Number(config.universe.colonization_supply_max_boost) || 0.25;

    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const totalResources = mineraiCargo + siliciumCargo + hydrogeneCargo;
    const tranches = Math.floor(totalResources / trancheSize);
    const boost = Math.min(maxBoost, tranches * boostPerTranche);

    // Find the colonizing planet at target coordinates
    const [targetPlanet] = await ctx.db
      .select({ id: planets.id })
      .from(planets)
      .where(and(
        eq(planets.galaxy, fleetEvent.targetGalaxy),
        eq(planets.system, fleetEvent.targetSystem),
        eq(planets.position, fleetEvent.targetPosition),
        eq(planets.status, 'colonizing'),
      ))
      .limit(1);

    if (targetPlanet && ctx.colonizationService && boost > 0) {
      const process = await ctx.colonizationService.getProcess(targetPlanet.id);
      if (process) {
        await ctx.colonizationService.applyBoost(process.id, boost);

        // Auto-resolve any pending 'shortage' event
        const [shortageEvent] = await ctx.db
          .select({ id: colonizationEvents.id })
          .from(colonizationEvents)
          .where(and(
            eq(colonizationEvents.processId, process.id),
            eq(colonizationEvents.status, 'pending'),
            eq(colonizationEvents.eventType, 'shortage'),
          ))
          .limit(1);

        if (shortageEvent) {
          await ctx.colonizationService.resolveEvent(shortageEvent.id, fleetEvent.userId);
        }
      }
    }

    // Transfer cargo to the colonizing planet
    if (targetPlanet && totalResources > 0) {
      await ctx.db
        .update(planets)
        .set({
          minerai: sql`${planets.minerai} + ${mineraiCargo}`,
          silicium: sql`${planets.silicium} + ${siliciumCargo}`,
          hydrogene: sql`${planets.hydrogene} + ${hydrogeneCargo}`,
        })
        .where(eq(planets.id, targetPlanet.id));
    }

    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
  }
}

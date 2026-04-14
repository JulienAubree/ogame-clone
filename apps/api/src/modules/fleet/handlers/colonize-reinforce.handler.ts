import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, colonizationEvents } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class ColonizeReinforceHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();

    // Must include at least one combat ship (weapons > 0)
    const hasCombatShip = Object.entries(input.ships).some(([shipId, count]) => {
      if (count <= 0) return false;
      const def = config.ships[shipId];
      return def && (def.weapons ?? 0) > 0;
    });

    if (!hasCombatShip) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Au moins un vaisseau de combat est requis pour securiser le secteur' });
    }

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

    // Proportional boost: +2% per combat ship, capped at 20%
    const boostPerShip = Number(config.universe.colonization_reinforce_boost_per_ship) || 0.02;
    const maxBoost = Number(config.universe.colonization_reinforce_max_boost) || 0.20;

    // Count combat ships (weapons > 0)
    const ships = fleetEvent.ships as Record<string, number>;
    let combatShipCount = 0;
    for (const [shipId, count] of Object.entries(ships)) {
      if (count <= 0) continue;
      const def = config.ships[shipId];
      if (def && (def.weapons ?? 0) > 0) {
        combatShipCount += count;
      }
    }
    const boost = Math.min(maxBoost, combatShipCount * boostPerShip);

    // Find the colonizing planet
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

        // Auto-resolve any pending 'raid' event
        const [raidEvent] = await ctx.db
          .select({ id: colonizationEvents.id })
          .from(colonizationEvents)
          .where(and(
            eq(colonizationEvents.processId, process.id),
            eq(colonizationEvents.status, 'pending'),
            eq(colonizationEvents.eventType, 'raid'),
          ))
          .limit(1);

        if (raidEvent) {
          await ctx.colonizationService.resolveEvent(raidEvent.id, fleetEvent.userId);
        }
      }
    }

    // Military ships return
    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
  }
}

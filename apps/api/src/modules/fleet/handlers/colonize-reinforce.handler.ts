import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, colonizationEvents } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class ColonizeReinforceHandler implements MissionHandler {
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
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Aucune colonisation en cours à cette position' });
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const config = await ctx.gameConfigService.getFullConfig();
    const boost = Number(config.universe.colonization_reinforce_boost) || 0.12;

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

    if (targetPlanet && ctx.colonizationService) {
      const process = await ctx.colonizationService.getProcess(targetPlanet.id);
      if (process) {
        // Apply reinforce boost
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

    // Military ships, no cargo transfer — ships return empty
    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 } };
  }
}

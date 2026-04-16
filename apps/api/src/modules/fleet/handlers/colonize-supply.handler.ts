import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, colonizationEvents, colonizationProcesses } from '@exilium/db';
import { totalCargoCapacity } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';

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

    // Check supply hasn't already been completed
    if (ctx.colonizationService) {
      const process = await ctx.colonizationService.getProcess(target.id);
      if (process?.supplyCompleted) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le ravitaillement vital a deja ete accompli pour cette colonie' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const config = await ctx.gameConfigService.getFullConfig();

    // Proportional boost: +3% per tranche of resources, capped at 15%
    // Tranche size scales with IPC level: base * (1 + scalingFactor * ipcLevel)
    const boostPerTranche = Number(config.universe.colonization_supply_boost_per_tranche) || 0.03;
    const baseTrancheSize = Number(config.universe.colonization_supply_tranche_size) || 2000;
    const maxBoost = Number(config.universe.colonization_supply_max_boost) || 0.15;
    const sf = Number(config.universe.colonization_cost_scaling_factor) || 0.5;
    const ipcLevel = ctx.colonizationService ? await ctx.colonizationService.getIpcLevel(fleetEvent.userId) : 0;
    const trancheSize = Math.floor(baseTrancheSize * (1 + sf * ipcLevel));

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

    let boostApplied = 0;

    if (targetPlanet && ctx.colonizationService && boost > 0) {
      const process = await ctx.colonizationService.getProcess(targetPlanet.id);
      if (process && !process.supplyCompleted) {
        await ctx.colonizationService.applyBoost(process.id, boost);
        boostApplied = boost;

        // Mark supply as completed (one-shot)
        await ctx.db
          .update(colonizationProcesses)
          .set({ supplyCompleted: true })
          .where(eq(colonizationProcesses.id, process.id));

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

    // Create mission report
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    let reportId: string | undefined;
    if (ctx.reportService) {
      const shipStatsMap = buildShipStatsMap(config);
      const [originPlanet] = await ctx.db.select({
        galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
      }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'colonize_supply',
        title: `Ravitaillement vital ${coords}`,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: originPlanet ? {
          galaxy: originPlanet.galaxy,
          system: originPlanet.system,
          position: originPlanet.position,
          planetName: originPlanet.name,
        } : undefined,
        fleet: { ships: fleetEvent.ships, totalCargo: totalCargoCapacity(fleetEvent.ships as Record<string, number>, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: {
          resourcesDelivered: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
          totalResources,
          boostApplied: Math.round(boostApplied * 100),
        },
      });
      reportId = report.id;
    }

    return { scheduleReturn: true, cargo: { minerai: 0, silicium: 0, hydrogene: 0 }, reportId };
  }
}

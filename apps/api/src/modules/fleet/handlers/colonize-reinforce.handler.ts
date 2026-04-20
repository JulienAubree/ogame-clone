import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips } from '@exilium/db';
import { totalCargoCapacity } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';

export class ColonizeReinforceHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    // At least one ship required (any type)
    const hasShip = Object.entries(input.ships).some(([, count]) => count > 0);
    if (!hasShip) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Au moins un vaisseau est requis pour securiser le secteur' });
    }

    // Target must be a colonizing planet owned by the user
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
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    // Find the colonizing planet at target coordinates
    const [targetPlanet] = await ctx.db
      .select()
      .from(planets)
      .where(and(
        eq(planets.galaxy, fleetEvent.targetGalaxy),
        eq(planets.system, fleetEvent.targetSystem),
        eq(planets.position, fleetEvent.targetPosition),
        eq(planets.status, 'colonizing'),
      ))
      .limit(1);

    if (!targetPlanet) {
      // Planet no longer colonizing — return fleet with cargo
      let reportId: string | undefined;
      if (ctx.reportService) {
        const [originPlanet] = fleetEvent.originPlanetId
          ? await ctx.db.select({
              galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
            }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
          : [];
        const report = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'colonize_reinforce',
          title: `Renforcement echoue ${coords}`,
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
          fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
          departureTime: fleetEvent.departureTime,
          completionTime: fleetEvent.arrivalTime,
          result: { aborted: true, reason: 'no_colonizing_planet' },
        });
        reportId = report.id;
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    // Deposit resources on the colonizing planet
    await ctx.db
      .update(planets)
      .set({
        minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
        silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
        hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
      })
      .where(eq(planets.id, targetPlanet.id));

    // Transfer ships to planetShips — atomic increment, safe under concurrent arrivals
    const shipUpdates: Record<string, any> = {};
    for (const [shipId, count] of Object.entries(ships)) {
      if (count > 0 && shipId !== 'flagship') {
        const col = planetShips[shipId as keyof typeof planetShips];
        shipUpdates[shipId] = sql`${col} + ${count}`;
      }
    }
    if (Object.keys(shipUpdates).length > 0) {
      await ctx.db
        .update(planetShips)
        .set(shipUpdates)
        .where(eq(planetShips.planetId, targetPlanet.id));
    }

    // Create mission report
    let reportId: string | undefined;
    if (ctx.reportService) {
      const [originPlanet] = fleetEvent.originPlanetId
        ? await ctx.db.select({
            galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
          }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
        : [];

      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'colonize_reinforce',
        title: `Renforcement du secteur ${coords}`,
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
        fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result: {
          stationed: Object.fromEntries(
            Object.entries(ships).filter(([, count]) => count > 0),
          ),
          deposited: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        },
      });
      reportId = report.id;
    }

    // Ships stay — no return trip
    return { scheduleReturn: false, reportId };
  }
}

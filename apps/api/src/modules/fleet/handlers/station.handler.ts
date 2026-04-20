import { eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { planets, planetShips } from '@exilium/db';
import { totalCargoCapacity } from '@exilium/game-engine';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';

export class StationHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    // Station only allowed on own planets
    const [target] = await ctx.db
      .select({ userId: planets.userId })
      .from(planets)
      .where(
        and(
          eq(planets.galaxy, input.targetGalaxy),
          eq(planets.system, input.targetSystem),
          eq(planets.position, input.targetPosition),
        ),
      )
      .limit(1);

    const [origin] = await ctx.db
      .select({ userId: planets.userId })
      .from(planets)
      .where(eq(planets.id, input.originPlanetId))
      .limit(1);

    if (!target || !origin || target.userId !== origin.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Le stationnement n\'est possible que sur vos propres planètes' });
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

    const createStationReport = async (title: string, result: Record<string, unknown>) => {
      if (!ctx.reportService) return undefined;
      const [originPlanet] = fleetEvent.originPlanetId
        ? await ctx.db.select({
            galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
          }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1)
        : [];
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'station',
        title,
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
        result,
      });
      return report.id;
    };

    // Check target planet exists
    const [targetPlanet] = fleetEvent.targetPlanetId
      ? await ctx.db.select().from(planets).where(eq(planets.id, fleetEvent.targetPlanetId)).limit(1)
      : [];

    if (!targetPlanet) {
      const reportId = await createStationReport(
        `Stationnement échoué ${coords}`,
        { aborted: true, reason: 'no_planet' },
      );
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    // Deposit resources
    await ctx.db
      .update(planets)
      .set({
        minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
        silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
        hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
      })
      .where(eq(planets.id, targetPlanet.id));

    // Transfer ships — atomic increment, safe under concurrent arrivals
    const shipUpdates: Record<string, any> = {};
    for (const [shipId, count] of Object.entries(fleetEvent.ships)) {
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

    const reportId = await createStationReport(
      `Flotte stationnée ${coords}`,
      {
        stationed: Object.fromEntries(
          Object.entries(fleetEvent.ships).filter(([, count]) => count > 0),
        ),
        deposited: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
      },
    );

    // Station: no return trip
    return { scheduleReturn: false, reportId };
  }
}

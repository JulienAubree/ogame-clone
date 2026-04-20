import { eq, sql } from 'drizzle-orm';
import { planets, planetShips } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { totalCargoCapacity } from '@exilium/game-engine';

export class AbandonReturnHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // Never created from the UI — no validation.
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    const metadata = (fleetEvent.metadata ?? {}) as {
      abandonedPlanet?: { name: string; galaxy: number; system: number; position: number };
      overflow?: { minerai: number; silicium: number; hydrogene: number };
    };

    const createReport = async (title: string, result: Record<string, unknown>) => {
      if (!ctx.reportService) return undefined;
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'abandon_return',
        title,
        coordinates: {
          galaxy: fleetEvent.targetGalaxy,
          system: fleetEvent.targetSystem,
          position: fleetEvent.targetPosition,
        },
        originCoordinates: metadata.abandonedPlanet ? {
          galaxy: metadata.abandonedPlanet.galaxy,
          system: metadata.abandonedPlanet.system,
          position: metadata.abandonedPlanet.position,
          planetName: metadata.abandonedPlanet.name,
        } : undefined,
        fleet: { ships, totalCargo: totalCargoCapacity(ships, shipStatsMap) },
        departureTime: fleetEvent.departureTime,
        completionTime: fleetEvent.arrivalTime,
        result,
      });
      return report.id;
    };

    const [target] = fleetEvent.targetPlanetId
      ? await ctx.db.select().from(planets).where(eq(planets.id, fleetEvent.targetPlanetId)).limit(1)
      : [];

    if (!target) {
      // Destination also gone — resources+ships lost (documented edge case).
      const reportId = await createReport(
        `Retour d'abandon échoué`,
        {
          aborted: true,
          reason: 'no_destination',
          shipsLost: ships,
          cargoLost: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        },
      );
      return { scheduleReturn: false, reportId };
    }

    // Deposit cargo on destination
    await ctx.db
      .update(planets)
      .set({
        minerai: String(Number(target.minerai) + mineraiCargo),
        silicium: String(Number(target.silicium) + siliciumCargo),
        hydrogene: String(Number(target.hydrogene) + hydrogeneCargo),
      })
      .where(eq(planets.id, target.id));

    // Merge ships into destination planet_ships (skip flagship, re-homed separately)
    const nonFlagshipShips: Record<string, number> = {};
    for (const [shipId, count] of Object.entries(ships)) {
      if (shipId !== 'flagship' && count > 0) {
        nonFlagshipShips[shipId] = count;
      }
    }
    if (Object.keys(nonFlagshipShips).length > 0) {
      const shipUpdates: Record<string, any> = {};
      for (const [shipId, count] of Object.entries(nonFlagshipShips)) {
        const col = planetShips[shipId as keyof typeof planetShips];
        if (!col) continue;
        shipUpdates[shipId] = sql`${col} + ${count}`;
      }
      if (Object.keys(shipUpdates).length > 0) {
        await ctx.db
          .insert(planetShips)
          .values({ planetId: target.id, ...nonFlagshipShips })
          .onConflictDoUpdate({
            target: planetShips.planetId,
            set: shipUpdates,
          });
      }
    }

    // Re-station the flagship if it was part of the return fleet
    if (ships['flagship'] && ships['flagship'] > 0 && ctx.flagshipService) {
      await ctx.flagshipService.returnFromMission(fleetEvent.userId, target.id);
    }

    const reportId = await createReport(
      `Abandon de ${metadata.abandonedPlanet?.name ?? 'colonie'} terminé`,
      {
        destination: {
          id: target.id,
          name: target.name,
          galaxy: target.galaxy,
          system: target.system,
          position: target.position,
        },
        delivered: {
          ships,
          cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        },
        overflow: metadata.overflow ?? null,
      },
    );

    return { scheduleReturn: false, reportId };
  }
}

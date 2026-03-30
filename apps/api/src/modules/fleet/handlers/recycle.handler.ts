import { eq, and } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { debrisFields, planets } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { formatDuration, buildShipStatsMap } from '../fleet.types.js';
import { totalCargoCapacity } from '@exilium/game-engine';
import { findShipByRole } from '../../../lib/config-helpers.js';

export class RecycleHandler implements MissionHandler {
  async validateFleet(input: SendFleetInput, _config: GameConfig, ctx: MissionHandlerContext): Promise<void> {
    const config = await ctx.gameConfigService.getFullConfig();
    const recyclerDef = findShipByRole(config, 'recycler');
    for (const [shipType, count] of Object.entries(input.ships)) {
      if (count > 0 && shipType !== recyclerDef.id && shipType !== 'flagship') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Seuls les recycleurs peuvent être envoyés en mission recyclage' });
      }
    }
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);

    const [debris] = await ctx.db
      .select()
      .from(debrisFields)
      .where(
        and(
          eq(debrisFields.galaxy, fleetEvent.targetGalaxy),
          eq(debrisFields.system, fleetEvent.targetSystem),
          eq(debrisFields.position, fleetEvent.targetPosition),
        ),
      )
      .limit(1);

    if (!debris || (Number(debris.minerai) <= 0 && Number(debris.silicium) <= 0)) {
      const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
      let reportId: string | undefined;
      if (ctx.reportService) {
        const config = await ctx.gameConfigService.getFullConfig();
        const shipStatsMap = buildShipStatsMap(config);
        const [originPlanet] = await ctx.db.select({
          galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
        }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);
        const report = await ctx.reportService.create({
          userId: fleetEvent.userId,
          fleetEventId: fleetEvent.id,
          missionType: 'recycle',
          title: `Rapport de recyclage ${coords} — Rien trouvé`,
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
          fleet: {
            ships: fleetEvent.ships,
            totalCargo: totalCargoCapacity(fleetEvent.ships, shipStatsMap),
          },
          departureTime: fleetEvent.departureTime,
          completionTime: new Date(),
          result: {
            collected: { minerai: 0, silicium: 0 },
            debrisRemaining: null,
            debrisAvailable: { minerai: 0, silicium: 0 },
            empty: true,
          },
        });
        reportId = report.id;
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    const config = await ctx.gameConfigService.getFullConfig();
    const recyclerDef = findShipByRole(config, 'recycler');
    const recyclerCount = fleetEvent.ships[recyclerDef.id] ?? 0;
    const cargoPerRecycler = recyclerDef.cargoCapacity ?? 20000;
    const totalCargoCapacityValue = recyclerCount * cargoPerRecycler;

    let remainingCargo = totalCargoCapacityValue;
    const availableMinerai = Number(debris.minerai);
    const availableSilicium = Number(debris.silicium);

    const collectedMinerai = Math.min(availableMinerai, remainingCargo);
    remainingCargo -= collectedMinerai;
    const collectedSilicium = Math.min(availableSilicium, remainingCargo);

    const newMinerai = availableMinerai - collectedMinerai;
    const newSilicium = availableSilicium - collectedSilicium;

    if (newMinerai <= 0 && newSilicium <= 0) {
      await ctx.db.delete(debrisFields).where(eq(debrisFields.id, debris.id));
    } else {
      await ctx.db
        .update(debrisFields)
        .set({
          minerai: String(newMinerai),
          silicium: String(newSilicium),
          updatedAt: new Date(),
        })
        .where(eq(debrisFields.id, debris.id));
    }

    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const duration = formatDuration(fleetEvent.arrivalTime.getTime() - fleetEvent.departureTime.getTime());

    // Fetch origin planet for report
    const [originPlanet] = await ctx.db.select({
      galaxy: planets.galaxy,
      system: planets.system,
      position: planets.position,
      name: planets.name,
    }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);

    // Create mission report
    let reportId: string | undefined;
    if (ctx.reportService) {
      const shipStatsMap = buildShipStatsMap(config);
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'recycle',
        title: `Rapport de recyclage ${coords}`,
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
        fleet: {
          ships: fleetEvent.ships,
          totalCargo: totalCargoCapacity(fleetEvent.ships, shipStatsMap),
        },
        departureTime: fleetEvent.departureTime,
        completionTime: new Date(),
        result: {
          collected: { minerai: collectedMinerai, silicium: collectedSilicium },
          debrisRemaining: newMinerai > 0 || newSilicium > 0
            ? { minerai: newMinerai, silicium: newSilicium }
            : null,
          debrisAvailable: { minerai: availableMinerai, silicium: availableSilicium },
          recyclerCount,
          cargoCapacity: totalCargoCapacityValue,
        },
      });
      reportId = report.id;
    }

    // Hook: Exilium drop on recycling
    if (ctx.exiliumService) {
      await ctx.exiliumService.tryDrop(fleetEvent.userId, 'recycling', {
        fleetEventId: fleetEvent.id,
      }).catch((e) => console.warn('[exilium-drop] tryDrop failed:', e));
    }

    return {
      scheduleReturn: true,
      cargo: {
        minerai: mineraiCargo + collectedMinerai,
        silicium: siliciumCargo + collectedSilicium,
        hydrogene: hydrogeneCargo,
      },
      reportId,
    };
  }
}

import { eq } from 'drizzle-orm';
import { planets, colonizationProcesses } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { buildShipStatsMap } from '../fleet.types.js';
import { totalCargoCapacity } from '@exilium/game-engine';

export class TransportHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // No transport-specific validation
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const ships = fleetEvent.ships;
    const config = await ctx.gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    const createTransportReport = async (title: string, result: Record<string, unknown>) => {
      if (!ctx.reportService) return undefined;
      const [originPlanet] = await ctx.db.select({
        galaxy: planets.galaxy, system: planets.system, position: planets.position, name: planets.name,
      }).from(planets).where(eq(planets.id, fleetEvent.originPlanetId)).limit(1);
      const report = await ctx.reportService.create({
        userId: fleetEvent.userId,
        fleetEventId: fleetEvent.id,
        missionType: 'transport',
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
      const reportId = await createTransportReport(
        `Transport échoué ${coords}`,
        { aborted: true, reason: 'no_planet' },
      );
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
        reportId,
      };
    }

    await ctx.db
      .update(planets)
      .set({
        minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
        silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
        hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
      })
      .where(eq(planets.id, targetPlanet.id));

    // Check if this is a colonizing planet that needs outpost establishment
    if (targetPlanet.status === 'colonizing' && ctx.colonizationService) {
      const process = await ctx.colonizationService.getProcess(targetPlanet.id);
      if (process && !process.outpostEstablished) {
        const { minerai: thresholdMinerai, silicium: thresholdSilicium } =
          await ctx.colonizationService.getOutpostThresholds(fleetEvent.userId);

        // Check if total resources on planet (after deposit) meet threshold
        const totalMinerai = Number(targetPlanet.minerai) + mineraiCargo;
        const totalSilicium = Number(targetPlanet.silicium) + siliciumCargo;

        if (totalMinerai >= thresholdMinerai && totalSilicium >= thresholdSilicium) {
          await ctx.db
            .update(colonizationProcesses)
            .set({ outpostEstablished: true })
            .where(eq(colonizationProcesses.id, process.id));
        }
      }

      // Trigger the "recent convoy" rate bonus on any delivery with cargo
      if (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0) {
        await ctx.colonizationService.updateLastConvoySupplyAt(targetPlanet.id);
      }
    }

    const reportId = await createTransportReport(
      `Transport effectué ${coords}`,
      { delivered: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo } },
    );

    return {
      scheduleReturn: true,
      cargo: { minerai: 0, silicium: 0, hydrogene: 0 },
      reportId,
    };
  }
}

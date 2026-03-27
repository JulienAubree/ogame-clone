import { eq } from 'drizzle-orm';
import { planets, planetShips } from '@exilium/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';
import { formatDuration } from '../fleet.types.js';

export class StationHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // No station-specific validation
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);
    const coords = `[${fleetEvent.targetGalaxy}:${fleetEvent.targetSystem}:${fleetEvent.targetPosition}]`;
    const duration = formatDuration(fleetEvent.arrivalTime.getTime() - fleetEvent.departureTime.getTime());

    // Check target planet exists
    const [targetPlanet] = fleetEvent.targetPlanetId
      ? await ctx.db.select().from(planets).where(eq(planets.id, fleetEvent.targetPlanetId)).limit(1)
      : [];

    if (!targetPlanet) {
      if (ctx.messageService) {
        await ctx.messageService.createSystemMessage(
          fleetEvent.userId,
          'mission',
          `Stationnement echoue ${coords}`,
          `Planete deserte trouvee en ${coords}. Impossible de stationner en zone hostile.\nDuree du trajet : ${duration}\nVotre flotte fait demi-tour avec son cargo.`,
        );
      }
      return {
        scheduleReturn: true,
        cargo: { minerai: mineraiCargo, silicium: siliciumCargo, hydrogene: hydrogeneCargo },
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

    // Transfer ships
    const [targetShips] = await ctx.db
      .select()
      .from(planetShips)
      .where(eq(planetShips.planetId, targetPlanet.id))
      .limit(1);

    // Transfer regular ships (flagship handled centrally in processArrival)
    if (targetShips) {
      const shipUpdates: Record<string, number> = {};
      for (const [shipId, count] of Object.entries(fleetEvent.ships)) {
        if (count > 0 && shipId !== 'flagship') {
          const current = (targetShips[shipId as keyof typeof targetShips] ?? 0) as number;
          shipUpdates[shipId] = current + count;
        }
      }
      if (Object.keys(shipUpdates).length > 0) {
        await ctx.db
          .update(planetShips)
          .set(shipUpdates)
          .where(eq(planetShips.planetId, targetPlanet.id));
      }
    }

    if (ctx.messageService) {
      const shipList = Object.entries(fleetEvent.ships)
        .filter(([, count]) => count > 0)
        .map(([id, count]) => `${id}: ${count}`)
        .join(', ');
      const parts = [`Flotte stationnée en ${coords}\n`];
      parts.push(`Durée du trajet : ${duration}`);
      parts.push(`Vaisseaux stationnés : ${shipList}`);
      if (mineraiCargo > 0 || siliciumCargo > 0 || hydrogeneCargo > 0) {
        parts.push(`Cargo déposé : ${mineraiCargo} minerai, ${siliciumCargo} silicium, ${hydrogeneCargo} hydrogène`);
      }
      await ctx.messageService.createSystemMessage(
        fleetEvent.userId,
        'mission',
        `Flotte stationnée ${coords}`,
        parts.join('\n'),
      );
    }

    // Station: no return trip, dispatcher will mark completed
    return { scheduleReturn: false };
  }
}

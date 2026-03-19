import { eq } from 'drizzle-orm';
import { planets, planetShips } from '@ogame-clone/db';
import type { MissionHandler, SendFleetInput, GameConfig, MissionHandlerContext, FleetEvent, ArrivalResult } from '../fleet.types.js';

export class StationHandler implements MissionHandler {
  async validateFleet(_input: SendFleetInput, _config: GameConfig, _ctx: MissionHandlerContext): Promise<void> {
    // No station-specific validation
  }

  async processArrival(fleetEvent: FleetEvent, ctx: MissionHandlerContext): Promise<ArrivalResult> {
    const mineraiCargo = Number(fleetEvent.mineraiCargo);
    const siliciumCargo = Number(fleetEvent.siliciumCargo);
    const hydrogeneCargo = Number(fleetEvent.hydrogeneCargo);

    if (fleetEvent.targetPlanetId) {
      const [targetPlanet] = await ctx.db
        .select()
        .from(planets)
        .where(eq(planets.id, fleetEvent.targetPlanetId))
        .limit(1);

      if (targetPlanet) {
        // Deposit resources
        await ctx.db
          .update(planets)
          .set({
            minerai: String(Number(targetPlanet.minerai) + mineraiCargo),
            silicium: String(Number(targetPlanet.silicium) + siliciumCargo),
            hydrogene: String(Number(targetPlanet.hydrogene) + hydrogeneCargo),
          })
          .where(eq(planets.id, fleetEvent.targetPlanetId));

        // Transfer ships
        const [targetShips] = await ctx.db
          .select()
          .from(planetShips)
          .where(eq(planetShips.planetId, fleetEvent.targetPlanetId))
          .limit(1);

        if (targetShips) {
          const shipUpdates: Record<string, number> = {};
          for (const [shipId, count] of Object.entries(fleetEvent.ships)) {
            if (count > 0) {
              const current = (targetShips[shipId as keyof typeof targetShips] ?? 0) as number;
              shipUpdates[shipId] = current + count;
            }
          }
          await ctx.db
            .update(planetShips)
            .set(shipUpdates)
            .where(eq(planetShips.planetId, fleetEvent.targetPlanetId));
        }
      }
    }

    // Station: no return trip, dispatcher will mark completed
    return { scheduleReturn: false };
  }
}

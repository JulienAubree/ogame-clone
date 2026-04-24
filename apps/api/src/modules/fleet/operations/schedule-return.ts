import { eq } from 'drizzle-orm';
import { planets, fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import { fleetSpeed, travelTime } from '@exilium/game-engine';
import type { ShipStats } from '@exilium/game-engine';
import type { Queue } from 'bullmq';
import { buildFleetConfig, buildSpeedMultipliers } from '../fleet.helpers.js';
import { buildShipStatsMap } from '../fleet.types.js';
import type { GameConfigService } from '../../admin/game-config.service.js';
import type { createFlagshipService } from '../../flagship/flagship.service.js';

export interface ScheduleReturnDeps {
  db: Database;
  gameConfigService: GameConfigService;
  fleetQueue: Queue;
  flagshipService?: ReturnType<typeof createFlagshipService>;
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> };
  getResearchLevels(userId: string): Promise<Record<string, number>>;
}

/**
 * Schedule the return leg of a fleet after it finishes its mission. Called
 * by mission handlers (processArrival path) once the fleet is ready to go
 * home. Recomputes speed + travel time from the current origin planet —
 * research levels and talents may have changed since the outbound leg.
 */
export function createScheduleReturn(deps: ScheduleReturnDeps) {
  const { db, gameConfigService, fleetQueue, flagshipService, talentService, getResearchLevels } = deps;

  return async function scheduleReturn(
    fleetEventId: string,
    originPlanetId: string,
    targetCoords: { galaxy: number; system: number; position: number },
    ships: Record<string, number>,
    mineraiCargo: number,
    siliciumCargo: number,
    hydrogeneCargo: number,
  ) {
    const [originPlanet] = await db
      .select()
      .from(planets)
      .where(eq(planets.id, originPlanetId))
      .limit(1);

    if (!originPlanet) return;

    const config = await gameConfigService.getFullConfig();
    const fleetConfig = buildFleetConfig(config);
    const shipStatsMap = buildShipStatsMap(config);
    const [event] = await db.select().from(fleetEvents).where(eq(fleetEvents.id, fleetEventId)).limit(1);

    // Inject flagship stats if flagship is in returning fleet
    if (ships['flagship'] && ships['flagship'] > 0 && flagshipService && event) {
      const flagship = await flagshipService.get(event.userId);
      if (flagship) {
        shipStatsMap['flagship'] = {
          baseSpeed: flagship.baseSpeed,
          fuelConsumption: flagship.fuelConsumption,
          cargoCapacity: flagship.cargoCapacity,
          driveType: flagship.driveType as ShipStats['driveType'],
          miningExtraction: 0,
        };
      }
    }

    const researchLevels = event ? await getResearchLevels(event.userId) : {};
    const returnTalentCtx = (event && talentService) ? await talentService.computeTalentContext(event.userId) : {};
    const baseReturnSpeedMult = buildSpeedMultipliers(ships, shipStatsMap, researchLevels, config.bonuses);
    const returnTalentSpeedFactor = 1 + (returnTalentCtx['fleet_speed'] ?? 0);
    const speedMultipliers: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseReturnSpeedMult)) {
      speedMultipliers[k] = v * returnTalentSpeedFactor;
    }
    const speed = fleetSpeed(ships, shipStatsMap, speedMultipliers);
    const universeSpeed = Number(config.universe.speed) || 1;
    const origin = { galaxy: originPlanet.galaxy, system: originPlanet.system, position: originPlanet.position };
    const duration = travelTime(targetCoords, origin, speed, universeSpeed, fleetConfig);

    const now = new Date();
    const returnTime = new Date(now.getTime() + duration * 1000);

    await db
      .update(fleetEvents)
      .set({
        phase: 'return',
        departureTime: now,
        arrivalTime: returnTime,
        mineraiCargo: String(mineraiCargo),
        siliciumCargo: String(siliciumCargo),
        hydrogeneCargo: String(hydrogeneCargo),
        ships,
      })
      .where(eq(fleetEvents.id, fleetEventId));

    await fleetQueue.add(
      'return',
      { fleetEventId },
      { delay: duration * 1000, jobId: `fleet-return-${fleetEventId}` },
    );
  };
}

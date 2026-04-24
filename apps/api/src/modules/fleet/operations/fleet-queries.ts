import { eq, and, count as dbCount, ne } from 'drizzle-orm';
import { fleetEvents } from '@exilium/db';
import type { Database } from '@exilium/db';
import {
  fleetSpeed,
  travelTime,
  distance,
  fuelConsumption,
  resolveBonus,
} from '@exilium/game-engine';
import type { ShipStats } from '@exilium/game-engine';
import { buildFleetConfig, buildSpeedMultipliers } from '../fleet.helpers.js';
import { buildShipStatsMap } from '../fleet.types.js';
import type { planets } from '@exilium/db';
import type { GameConfigService } from '../../admin/game-config.service.js';
import type { createFlagshipService } from '../../flagship/flagship.service.js';

export interface FleetQueriesDeps {
  db: Database;
  gameConfigService: GameConfigService;
  flagshipService?: ReturnType<typeof createFlagshipService>;
  talentService?: { computeTalentContext(userId: string, planetId?: string): Promise<Record<string, number>> };
  getOwnedPlanet(userId: string, planetId: string): Promise<typeof planets.$inferSelect>;
  getResearchLevels(userId: string): Promise<Record<string, number>>;
}

export interface FleetEstimateInput {
  originPlanetId: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  ships: Record<string, number>;
}

/**
 * Read-only fleet queries: slots, active movements, and estimates.
 *
 * `getFleetSlots` resolves the `fleet_count` bonus to determine the cap,
 * `listMovements` returns all the user's active fleet events, and
 * `estimateFleet` computes duration + fuel for a prospective send without
 * mutating anything (used by the fleet composer UI).
 */
export function createFleetQueries(deps: FleetQueriesDeps) {
  const { db, gameConfigService, flagshipService, talentService, getOwnedPlanet, getResearchLevels } = deps;

  async function getFleetSlots(userId: string) {
    const config = await gameConfigService.getFullConfig();
    const researchLevels = await getResearchLevels(userId);
    const max = Math.floor(resolveBonus('fleet_count', null, researchLevels, config.bonuses));
    const [{ count: current }] = await db
      .select({ count: dbCount() })
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.userId, userId),
        eq(fleetEvents.status, 'active'),
        ne(fleetEvents.mission, 'colonization_raid'),
      ));
    return { current: Number(current), max };
  }

  async function listMovements(userId: string) {
    return db
      .select()
      .from(fleetEvents)
      .where(and(
        eq(fleetEvents.userId, userId),
        eq(fleetEvents.status, 'active'),
        ne(fleetEvents.mission, 'colonization_raid'),
      ));
  }

  async function estimateFleet(userId: string, input: FleetEstimateInput) {
    const planet = await getOwnedPlanet(userId, input.originPlanetId);
    const config = await gameConfigService.getFullConfig();
    const shipStatsMap = buildShipStatsMap(config);

    // Inject flagship stats if present in estimate (rough baseline — send-fleet
    // uses effectiveStats, but estimate is informational and can skip that).
    if (input.ships['flagship'] && input.ships['flagship'] > 0 && flagshipService) {
      const flagship = await flagshipService.get(userId);
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

    const researchLevels = await getResearchLevels(userId);
    const talentCtx = talentService ? await talentService.computeTalentContext(userId) : {};
    const baseSpeedMult = buildSpeedMultipliers(input.ships, shipStatsMap, researchLevels, config.bonuses);
    const talentSpeedFactor = 1 + (talentCtx['fleet_speed'] ?? 0);
    const speedMultipliers: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseSpeedMult)) {
      speedMultipliers[k] = v * talentSpeedFactor;
    }
    const speed = fleetSpeed(input.ships, shipStatsMap, speedMultipliers);
    if (speed === 0) return { fuel: 0, duration: 0 };

    const fleetConfig = buildFleetConfig(config);
    const universeSpeed = Number(config.universe.speed) || 1;
    const origin = { galaxy: planet.galaxy, system: planet.system, position: planet.position };
    const target = { galaxy: input.targetGalaxy, system: input.targetSystem, position: input.targetPosition };
    const dist = distance(origin, target, fleetConfig);
    const dur = travelTime(origin, target, speed, universeSpeed, fleetConfig);
    const fuel = fuelConsumption(input.ships, dist, dur, shipStatsMap, { speedFactor: fleetConfig.speedFactor })
      / (1 + (talentCtx['fleet_fuel'] ?? 0));

    return { fuel, duration: dur };
  }

  return { getFleetSlots, listMovements, estimateFleet };
}

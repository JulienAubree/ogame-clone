import { resolveBonus } from '@exilium/game-engine';
import type { BonusDefinition, FleetConfig, ShipStats } from '@exilium/game-engine';

/**
 * Build the FleetConfig used by travel/distance math from the raw universe
 * config map. Defaults mirror the values initially seeded in universe_config.
 */
export function buildFleetConfig(config: { universe: Record<string, unknown> }): FleetConfig {
  return {
    galaxyFactor: Number(config.universe.fleet_distance_galaxy_factor) || 20000,
    systemBase: Number(config.universe.fleet_distance_system_base) || 2700,
    systemFactor: Number(config.universe.fleet_distance_system_factor) || 95,
    positionBase: Number(config.universe.fleet_distance_position_base) || 1000,
    positionFactor: Number(config.universe.fleet_distance_position_factor) || 5,
    samePositionDistance: Number(config.universe.fleet_same_position_distance) || 5,
    speedFactor: Number(config.universe.fleet_speed_factor) || 35000,
  };
}

/**
 * Per-ship speed multiplier (ship_speed bonus resolved against the pilot's
 * research levels). Ships missing from shipStatsMap are silently skipped —
 * legacy data sometimes references removed ship IDs.
 */
export function buildSpeedMultipliers(
  ships: Record<string, number>,
  shipStatsMap: Record<string, ShipStats>,
  researchLevels: Record<string, number>,
  bonusDefs: BonusDefinition[],
): Record<string, number> {
  const multipliers: Record<string, number> = {};
  for (const shipId of Object.keys(ships)) {
    const stats = shipStatsMap[shipId];
    if (stats) {
      multipliers[shipId] = resolveBonus('ship_speed', stats.driveType, researchLevels, bonusDefs);
    }
  }
  return multipliers;
}

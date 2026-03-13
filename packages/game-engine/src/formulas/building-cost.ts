import { BUILDINGS } from '../constants/buildings.js';
import type { BuildingId } from '../constants/buildings.js';

export interface ResourceCost {
  metal: number;
  crystal: number;
  deuterium: number;
}

/**
 * Cost to build a building at a given level.
 * Formula: baseCost * costFactor^(level-1)
 */
export function buildingCost(buildingId: BuildingId, level: number): ResourceCost {
  const def = BUILDINGS[buildingId];
  const factor = Math.pow(def.costFactor, level - 1);
  return {
    metal: Math.floor(def.baseCost.metal * factor),
    crystal: Math.floor(def.baseCost.crystal * factor),
    deuterium: Math.floor(def.baseCost.deuterium * factor),
  };
}

/**
 * Construction time in seconds.
 * Formula: (metalCost + crystalCost) / (2500 * (1 + roboticsLevel)) * 3600
 * Minimum 1 second.
 */
export function buildingTime(buildingId: BuildingId, level: number, roboticsLevel: number): number {
  const cost = buildingCost(buildingId, level);
  const seconds = Math.floor(((cost.metal + cost.crystal) / (2500 * (1 + roboticsLevel))) * 3600);
  return Math.max(1, seconds);
}

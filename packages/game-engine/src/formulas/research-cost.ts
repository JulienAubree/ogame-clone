import { getPhaseMultiplier } from '../constants/progression.js';
import type { ResourceCost, BuildingCostDef } from './building-cost.js';

export interface ResearchCostDef {
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
}

export function researchCost(def: ResearchCostDef, level: number): ResourceCost {
  const factor = Math.pow(def.costFactor, level - 1) * getPhaseMultiplier(level);
  return {
    minerai: Math.floor(def.baseCost.minerai * factor),
    silicium: Math.floor(def.baseCost.silicium * factor),
    hydrogene: Math.floor(def.baseCost.hydrogene * factor),
  };
}

/**
 * Research time in seconds.
 * @param bonusMultiplier - result of resolveBonus('research_time', null, ...)
 */
export function researchTime(def: ResearchCostDef, level: number, bonusMultiplier: number): number {
  const cost = researchCost(def, level);
  const seconds = Math.floor(((cost.minerai + cost.silicium) / 1000) * 3600 * bonusMultiplier * getPhaseMultiplier(level));
  return Math.max(1, seconds);
}

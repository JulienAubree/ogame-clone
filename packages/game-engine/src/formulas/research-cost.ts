import { RESEARCH } from '../constants/research.js';
import type { ResearchId } from '../constants/research.js';
import type { ResourceCost } from './building-cost.js';

export function researchCost(researchId: ResearchId, level: number): ResourceCost {
  const def = RESEARCH[researchId];
  const factor = Math.pow(def.costFactor, level - 1);
  return {
    metal: Math.floor(def.baseCost.metal * factor),
    crystal: Math.floor(def.baseCost.crystal * factor),
    deuterium: Math.floor(def.baseCost.deuterium * factor),
  };
}

export function researchTime(researchId: ResearchId, level: number, labLevel: number): number {
  const cost = researchCost(researchId, level);
  const seconds = Math.floor(((cost.metal + cost.crystal) / (1000 * (1 + labLevel))) * 3600);
  return Math.max(1, seconds);
}

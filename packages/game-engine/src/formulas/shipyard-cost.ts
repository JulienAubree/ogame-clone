import type { ResourceCost } from './building-cost.js';

export interface UnitCostDef {
  cost: { minerai: number; silicium: number; hydrogene: number };
}

export function shipCost(def: UnitCostDef): ResourceCost {
  return { ...def.cost };
}

export function shipTime(def: UnitCostDef, buildingLevel: number, reductionFactor: number = 1): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / (2500 * (1 + buildingLevel * reductionFactor))) * 3600);
  return Math.max(1, seconds);
}

export function defenseCost(def: UnitCostDef): ResourceCost {
  return { ...def.cost };
}

export function defenseTime(def: UnitCostDef, buildingLevel: number, reductionFactor: number = 1): number {
  const seconds = Math.floor(((def.cost.minerai + def.cost.silicium) / (2500 * (1 + buildingLevel * reductionFactor))) * 3600);
  return Math.max(1, seconds);
}

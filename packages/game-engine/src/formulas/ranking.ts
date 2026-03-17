export interface BuildingDef {
  id: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
}

export interface ResearchDef {
  id: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
}

export interface UnitDef {
  countColumn: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
}

export function calculateBuildingPoints(
  levels: Record<string, number>,
  buildingDefs: Record<string, BuildingDef>,
): number {
  let totalResources = 0;

  for (const [, def] of Object.entries(buildingDefs)) {
    const level = levels[def.id] ?? 0;
    for (let l = 1; l <= level; l++) {
      const factor = Math.pow(def.costFactor, l - 1);
      totalResources += Math.floor(def.baseCost.minerai * factor)
        + Math.floor(def.baseCost.silicium * factor)
        + Math.floor(def.baseCost.hydrogene * factor);
    }
  }

  return Math.floor(totalResources / 1000);
}

export function calculateResearchPoints(
  levels: Record<string, number>,
  researchDefs: Record<string, ResearchDef>,
): number {
  let totalResources = 0;

  for (const [, def] of Object.entries(researchDefs)) {
    const level = levels[def.id] ?? 0;
    for (let l = 1; l <= level; l++) {
      const factor = Math.pow(def.costFactor, l - 1);
      totalResources += Math.floor(def.baseCost.minerai * factor)
        + Math.floor(def.baseCost.silicium * factor)
        + Math.floor(def.baseCost.hydrogene * factor);
    }
  }

  return Math.floor(totalResources / 1000);
}

export function calculateFleetPoints(
  counts: Record<string, number>,
  shipDefs: Record<string, UnitDef>,
): number {
  let totalResources = 0;

  for (const [shipId, def] of Object.entries(shipDefs)) {
    const count = counts[def.countColumn] ?? counts[shipId] ?? 0;
    if (count > 0) {
      totalResources += count * (def.cost.minerai + def.cost.silicium + def.cost.hydrogene);
    }
  }

  return Math.floor(totalResources / 1000);
}

export function calculateDefensePoints(
  counts: Record<string, number>,
  defenseDefs: Record<string, UnitDef>,
): number {
  let totalResources = 0;

  for (const [defenseId, def] of Object.entries(defenseDefs)) {
    const count = counts[def.countColumn] ?? counts[defenseId] ?? 0;
    if (count > 0) {
      totalResources += count * (def.cost.minerai + def.cost.silicium + def.cost.hydrogene);
    }
  }

  return Math.floor(totalResources / 1000);
}

export function calculateTotalPoints(
  buildingPoints: number,
  researchPoints: number,
  fleetPoints: number,
  defensePoints: number,
): number {
  return buildingPoints + researchPoints + fleetPoints + defensePoints;
}

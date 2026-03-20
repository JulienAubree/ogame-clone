import {
  BUILDINGS, type BuildingId,
  RESEARCH, type ResearchId,
  SHIPS, type ShipId,
  DEFENSES, type DefenseId,
  COMBAT_STATS, RAPID_FIRE, SHIP_STATS,
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
} from '@ogame-clone/game-engine';

// GameConfig shape from the API
interface GameConfigData {
  buildings: Record<string, { id: string; name: string; description: string; flavorText?: string | null; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildingId: string; level: number }[] }>;
  research: Record<string, { id: string; name: string; description: string; flavorText?: string | null; effectDescription?: string | null; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  ships: Record<string, { id: string; name: string; description: string; flavorText?: string | null; cost: { minerai: number; silicium: number; hydrogene: number }; baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string; weapons: number; shield: number; armor: number; isStationary: boolean; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  defenses: Record<string, { id: string; name: string; description: string; flavorText?: string | null; cost: { minerai: number; silicium: number; hydrogene: number }; weapons: number; shield: number; armor: number; maxPerPlanet: number | null; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  rapidFire: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildingDetails {
  type: 'building';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  prerequisites: { buildingId: string; level: number }[];
  productionTable?: { level: number; value: number }[];
  productionLabel?: string;
  energyTable?: { level: number; value: number }[];
  energyLabel?: string;
  storageTable?: { level: number; value: number }[];
}

export interface ResearchDetails {
  type: 'research';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  effect: string;
  baseCost: { minerai: number; silicium: number; hydrogene: number };
  costFactor: number;
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
}

export interface RapidFireEntry {
  unitId: string;
  unitName: string;
  value: number;
}

export interface ShipDetails {
  type: 'ship';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: { weapons: number; shield: number; armor: number };
  stats: { baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string };
  isStationary: boolean;
  rapidFireAgainst: RapidFireEntry[];
  rapidFireFrom: RapidFireEntry[];
}

export interface DefenseDetails {
  type: 'defense';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: { weapons: number; shield: number; armor: number };
  rapidFireFrom: RapidFireEntry[];
  maxPerPlanet?: number;
}

// ---------------------------------------------------------------------------
// Name resolvers (use config if available, fall back to constants)
// ---------------------------------------------------------------------------

export function resolveBuildingName(id: string, config?: GameConfigData): string {
  if (config) return config.buildings[id]?.name ?? id;
  return BUILDINGS[id as BuildingId]?.name ?? id;
}

export function resolveResearchName(id: string, config?: GameConfigData): string {
  if (config) return config.research[id]?.name ?? id;
  return RESEARCH[id as ResearchId]?.name ?? id;
}

function resolveUnitName(id: string, config?: GameConfigData): string {
  if (config) {
    return config.ships[id]?.name ?? config.defenses[id]?.name ?? id;
  }
  return SHIPS[id as ShipId]?.name ?? DEFENSES[id as DefenseId]?.name ?? id;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildTable(fn: (level: number) => number, levels = 15): { level: number; value: number }[] {
  return Array.from({ length: levels }, (_, i) => ({
    level: i + 1,
    value: fn(i + 1),
  }));
}

function getRapidFireAgainst(unitId: string, config?: GameConfigData): RapidFireEntry[] {
  const rf = config?.rapidFire ?? RAPID_FIRE;
  const targets = rf[unitId];
  if (!targets) return [];
  return Object.entries(targets).map(([targetId, value]) => ({
    unitId: targetId,
    unitName: resolveUnitName(targetId, config),
    value,
  }));
}

function getRapidFireFrom(unitId: string, config?: GameConfigData): RapidFireEntry[] {
  const rf = config?.rapidFire ?? RAPID_FIRE;
  const entries: RapidFireEntry[] = [];
  for (const [attackerId, targets] of Object.entries(rf)) {
    if (targets[unitId]) {
      entries.push({
        unitId: attackerId,
        unitName: resolveUnitName(attackerId, config),
        value: targets[unitId],
      });
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlanetContext {
  maxTemp: number;
  productionFactor: number;
}

export function getBuildingDetails(id: string, config?: GameConfigData, planet?: PlanetContext): BuildingDetails {
  const cfgDef = config?.buildings[id];
  const def = BUILDINGS[id as BuildingId];
  const pf = planet?.productionFactor ?? 1;
  const maxTemp = planet?.maxTemp ?? 50;
  const details: BuildingDetails = {
    type: 'building',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    baseCost: cfgDef?.baseCost ?? def?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? def?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? [],
  };

  switch (id) {
    case 'mineraiMine':
      details.productionTable = buildTable((lvl) => mineraiProduction(lvl, pf));
      details.productionLabel = pf < 1 ? `Production minerai/h (energie: ${Math.round(pf * 100)}%)` : 'Production minerai/h';
      details.energyTable = buildTable(mineraiMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'siliciumMine':
      details.productionTable = buildTable((lvl) => siliciumProduction(lvl, pf));
      details.productionLabel = pf < 1 ? `Production silicium/h (energie: ${Math.round(pf * 100)}%)` : 'Production silicium/h';
      details.energyTable = buildTable(siliciumMineEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'hydrogeneSynth':
      details.productionTable = buildTable((lvl) => hydrogeneProduction(lvl, maxTemp, pf));
      details.productionLabel = `Production H\u2082/h (temp. ${maxTemp}${pf < 1 ? `, energie: ${Math.round(pf * 100)}%` : ''})`;
      details.energyTable = buildTable(hydrogeneSynthEnergy);
      details.energyLabel = 'Consommation energie';
      break;
    case 'solarPlant':
      details.energyTable = buildTable(solarPlantEnergy);
      details.energyLabel = 'Production energie';
      break;
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      details.storageTable = buildTable(storageCapacity, 10);
      break;
  }

  return details;
}

export function getResearchDetails(id: string, config?: GameConfigData): ResearchDetails {
  const cfgDef = config?.research[id];
  const def = RESEARCH[id as ResearchId];
  return {
    type: 'research',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    effect: cfgDef?.effectDescription ?? '',
    baseCost: cfgDef?.baseCost ?? def?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? def?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
  };
}

export function getShipDetails(id: string, config?: GameConfigData): ShipDetails {
  const cfgDef = config?.ships[id];
  const def = SHIPS[id as ShipId];
  const combat = cfgDef
    ? { weapons: cfgDef.weapons, shield: cfgDef.shield, armor: cfgDef.armor }
    : COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  const stats = cfgDef
    ? { baseSpeed: cfgDef.baseSpeed, fuelConsumption: cfgDef.fuelConsumption, cargoCapacity: cfgDef.cargoCapacity, driveType: cfgDef.driveType }
    : SHIP_STATS[id as ShipId] ?? { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion' };
  return {
    type: 'ship',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    cost: cfgDef?.cost ?? def?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
    combat,
    stats,
    isStationary: cfgDef?.isStationary ?? def?.isStationary ?? false,
    rapidFireAgainst: getRapidFireAgainst(id, config),
    rapidFireFrom: getRapidFireFrom(id, config),
  };
}

export function getDefenseDetails(id: string, config?: GameConfigData): DefenseDetails {
  const cfgDef = config?.defenses[id];
  const def = DEFENSES[id as DefenseId];
  const combat = cfgDef
    ? { weapons: cfgDef.weapons, shield: cfgDef.shield, armor: cfgDef.armor }
    : COMBAT_STATS[id] ?? { weapons: 0, shield: 0, armor: 0 };
  return {
    type: 'defense',
    id,
    name: cfgDef?.name ?? def?.name ?? id,
    description: cfgDef?.description ?? def?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    cost: cfgDef?.cost ?? def?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? def?.prerequisites ?? {},
    combat,
    rapidFireFrom: getRapidFireFrom(id, config),
    maxPerPlanet: cfgDef?.maxPerPlanet ?? def?.maxPerPlanet,
  };
}

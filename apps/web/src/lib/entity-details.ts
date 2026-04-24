import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
} from '@exilium/game-engine';
import { buildProductionConfig } from './production-config';

// GameConfig shape from the API
interface GameConfigData {
  buildings: Record<string, { id: string; name: string; description: string; flavorText?: string | null; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildingId: string; level: number }[] }>;
  research: Record<string, { id: string; name: string; description: string; flavorText?: string | null; effectDescription?: string | null; baseCost: { minerai: number; silicium: number; hydrogene: number }; costFactor: number; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  ships: Record<string, { id: string; name: string; description: string; flavorText?: string | null; cost: { minerai: number; silicium: number; hydrogene: number }; baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string; miningExtraction: number; weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; weaponProfiles?: WeaponProfile[]; combatCategoryId: string | null; isStationary: boolean; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
  defenses: Record<string, { id: string; name: string; description: string; flavorText?: string | null; cost: { minerai: number; silicium: number; hydrogene: number }; weapons: number; shield: number; hull: number; baseArmor: number; shotCount: number; weaponProfiles?: WeaponProfile[]; combatCategoryId: string | null; maxPerPlanet: number | null; prerequisites: { buildings: { buildingId: string; level: number }[]; research: { researchId: string; level: number }[] } }>;
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

export interface WeaponProfile {
  damage: number;
  shots: number;
  targetCategory: string;
  rafale?: { category: string; count: number };
  hasChainKill?: boolean;
}

export interface CombatStats {
  shield: number;
  baseArmor: number;
  hull: number;
  weapons: number;
  shotCount: number;
  weaponProfiles?: WeaponProfile[];
}

export interface ShipDetails {
  type: 'ship';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: CombatStats;
  stats: { baseSpeed: number; fuelConsumption: number; cargoCapacity: number; driveType: string; miningExtraction: number };
  isStationary: boolean;
}

export interface DefenseDetails {
  type: 'defense';
  id: string;
  name: string;
  description: string;
  flavorText: string;
  cost: { minerai: number; silicium: number; hydrogene: number };
  prerequisites: { buildings?: { buildingId: string; level: number }[]; research?: { researchId: string; level: number }[] };
  combat: CombatStats;
  maxPerPlanet?: number;
}

// ---------------------------------------------------------------------------
// Name resolvers (use config if available, fall back to constants)
// ---------------------------------------------------------------------------

function humanize(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').trim();
}

export function resolveBuildingName(id: string, config?: GameConfigData): string {
  return config?.buildings[id]?.name ?? humanize(id);
}

export function resolveResearchName(id: string, config?: GameConfigData): string {
  return config?.research[id]?.name ?? humanize(id);
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlanetContext {
  maxTemp: number;
  productionFactor: number;
}

export function getBuildingDetails(id: string, config?: GameConfigData, planet?: PlanetContext, fullConfig?: Parameters<typeof buildProductionConfig>[0]): BuildingDetails {
  const cfgDef = config?.buildings[id];
  const pf = planet?.productionFactor ?? 1;
  const maxTemp = planet?.maxTemp ?? 50;
  const prodConfig = fullConfig ? buildProductionConfig(fullConfig) : undefined;
  const details: BuildingDetails = {
    type: 'building',
    id,
    name: cfgDef?.name ?? humanize(id),
    description: cfgDef?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    baseCost: cfgDef?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? [],
  };

  switch (id) {
    case 'mineraiMine':
      details.productionTable = buildTable((lvl) => mineraiProduction(lvl, pf, prodConfig?.minerai));
      details.productionLabel = pf < 1 ? `Production minerai/h (energie: ${Math.round(pf * 100)}%)` : 'Production minerai/h';
      details.energyTable = buildTable((lvl) => mineraiMineEnergy(lvl, prodConfig?.mineraiEnergy));
      details.energyLabel = 'Consommation energie';
      break;
    case 'siliciumMine':
      details.productionTable = buildTable((lvl) => siliciumProduction(lvl, pf, prodConfig?.silicium));
      details.productionLabel = pf < 1 ? `Production silicium/h (energie: ${Math.round(pf * 100)}%)` : 'Production silicium/h';
      details.energyTable = buildTable((lvl) => siliciumMineEnergy(lvl, prodConfig?.siliciumEnergy));
      details.energyLabel = 'Consommation energie';
      break;
    case 'hydrogeneSynth':
      details.productionTable = buildTable((lvl) => hydrogeneProduction(lvl, maxTemp, pf, prodConfig?.hydrogene));
      details.productionLabel = `Production H\u2082/h (temp. ${maxTemp}${pf < 1 ? `, energie: ${Math.round(pf * 100)}%` : ''})`;
      details.energyTable = buildTable((lvl) => hydrogeneSynthEnergy(lvl, prodConfig?.hydrogeneEnergy));
      details.energyLabel = 'Consommation energie';
      break;
    case 'solarPlant':
      details.energyTable = buildTable((lvl) => solarPlantEnergy(lvl, prodConfig?.solar));
      details.energyLabel = 'Production energie';
      break;
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene':
      details.storageTable = buildTable((lvl) => storageCapacity(lvl, prodConfig?.storage), 10);
      break;
  }

  return details;
}

export function getResearchDetails(id: string, config?: GameConfigData): ResearchDetails {
  const cfgDef = config?.research[id];
  return {
    type: 'research',
    id,
    name: cfgDef?.name ?? humanize(id),
    description: cfgDef?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    effect: cfgDef?.effectDescription ?? '',
    baseCost: cfgDef?.baseCost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    costFactor: cfgDef?.costFactor ?? 1,
    prerequisites: cfgDef?.prerequisites ?? {},
  };
}

export function getShipDetails(id: string, config?: GameConfigData): ShipDetails {
  const cfgDef = config?.ships[id];
  const combat: CombatStats = cfgDef
    ? { shield: cfgDef.shield, baseArmor: cfgDef.baseArmor, hull: cfgDef.hull, weapons: cfgDef.weapons, shotCount: cfgDef.shotCount, weaponProfiles: cfgDef.weaponProfiles }
    : { shield: 0, baseArmor: 0, hull: 0, weapons: 0, shotCount: 1 };
  const stats = cfgDef
    ? { baseSpeed: cfgDef.baseSpeed, fuelConsumption: cfgDef.fuelConsumption, cargoCapacity: cfgDef.cargoCapacity, driveType: cfgDef.driveType, miningExtraction: cfgDef.miningExtraction ?? 0 }
    : { baseSpeed: 0, fuelConsumption: 0, cargoCapacity: 0, driveType: 'combustion' as string, miningExtraction: 0 };
  return {
    type: 'ship',
    id,
    name: cfgDef?.name ?? humanize(id),
    description: cfgDef?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    cost: cfgDef?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? {},
    combat,
    stats,
    isStationary: cfgDef?.isStationary ?? false,
  };
}

export function getDefenseDetails(id: string, config?: GameConfigData): DefenseDetails {
  const cfgDef = config?.defenses[id];
  const combat: CombatStats = cfgDef
    ? { shield: cfgDef.shield, baseArmor: cfgDef.baseArmor, hull: cfgDef.hull, weapons: cfgDef.weapons, shotCount: cfgDef.shotCount, weaponProfiles: cfgDef.weaponProfiles }
    : { shield: 0, baseArmor: 0, hull: 0, weapons: 0, shotCount: 1 };
  return {
    type: 'defense',
    id,
    name: cfgDef?.name ?? humanize(id),
    description: cfgDef?.description ?? '',
    flavorText: cfgDef?.flavorText ?? '',
    cost: cfgDef?.cost ?? { minerai: 0, silicium: 0, hydrogene: 0 },
    prerequisites: cfgDef?.prerequisites ?? {},
    combat,
    maxPerPlanet: cfgDef?.maxPerPlanet ?? undefined,
  };
}

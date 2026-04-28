import {
  mineraiProduction, siliciumProduction, hydrogeneProduction,
  solarPlantEnergy, mineraiMineEnergy, siliciumMineEnergy, hydrogeneSynthEnergy,
  storageCapacity,
  discoveryCooldown, depositSize,
  maxMarketOffers,
  calculateShieldCapacity, calculateShieldEnergy,
  getMissionRelayBonusPerLevel,
} from '@exilium/game-engine';
import { buildProductionConfig } from '@/lib/production-config';

/**
 * Tables de progression contextuelles affichées dans la fiche d'un bâtiment.
 * Chaque type de bâtiment a ses propres colonnes (production, capacité, etc.).
 */

export interface MineRow { level: number; production: number; gain: number | null; energy: number }
export interface SolarRow { level: number; production: number; gain: number | null }
export interface StorageRow { level: number; capacity: number; gain: number | null; armored: number }
export interface MissionCenterRow { level: number; cooldown: number; depositSize: number }
export interface MissionRelayRow { level: number; minerai: number; silicium: number; hydrogene: number; pirate: number }
export interface MarketRow { level: number; maxOffers: number }
export interface ShieldRow { level: number; shield: number; energy: number }

export type MissionRelayBiome = 'volcanic' | 'arid' | 'temperate' | 'glacial' | 'gaseous' | null;

export type TableData =
  | { type: 'mine'; title: string; rows: MineRow[] }
  | { type: 'solar'; title: string; rows: SolarRow[] }
  | { type: 'storage'; title: string; rows: StorageRow[] }
  | { type: 'missionCenter'; title: string; rows: MissionCenterRow[] }
  | { type: 'missionRelay'; title: string; rows: MissionRelayRow[]; biome: MissionRelayBiome }
  | { type: 'market'; title: string; rows: MarketRow[] }
  | { type: 'shield'; title: string; rows: ShieldRow[] };

export function getContextualTable(
  buildingId: string,
  currentLevel: number,
  maxTemp: number,
  productionFactor: number,
  prodConfig?: ReturnType<typeof buildProductionConfig>,
  protectedBaseRatio?: number,
  armoredMultiplier?: number,
  planetClassId?: string | null,
): TableData | null {
  const pf = productionFactor;
  const levels = Array.from({ length: 6 }, (_, i) => currentLevel + i);

  const makeMineRows = (
    prodFn: (level: number) => number,
    energyFn: (level: number) => number,
  ): MineRow[] =>
    levels.map((level, i) => ({
      level,
      production: prodFn(level),
      gain: i === 0 ? null : prodFn(level) - prodFn(level - 1),
      energy: i === 0 ? -energyFn(level) : -(energyFn(level) - energyFn(level - 1)),
    }));

  switch (buildingId) {
    case 'mineraiMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows(
          (l) => mineraiProduction(l, pf, prodConfig?.minerai),
          (l) => mineraiMineEnergy(l, prodConfig?.mineraiEnergy),
        ),
      };
    case 'siliciumMine':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows(
          (l) => siliciumProduction(l, pf, prodConfig?.silicium),
          (l) => siliciumMineEnergy(l, prodConfig?.siliciumEnergy),
        ),
      };
    case 'hydrogeneSynth':
      return {
        type: 'mine',
        title: 'Production & Énergie',
        rows: makeMineRows(
          (l) => hydrogeneProduction(l, maxTemp, pf, prodConfig?.hydrogene),
          (l) => hydrogeneSynthEnergy(l, prodConfig?.hydrogeneEnergy),
        ),
      };
    case 'solarPlant':
      return {
        type: 'solar',
        title: "Production d'énergie",
        rows: levels.map((level, i) => ({
          level,
          production: solarPlantEnergy(level, prodConfig?.solar),
          gain: i === 0 ? null : solarPlantEnergy(level, prodConfig?.solar) - solarPlantEnergy(level - 1, prodConfig?.solar),
        })),
      };
    case 'storageMinerai':
    case 'storageSilicium':
    case 'storageHydrogene': {
      const baseRatio = protectedBaseRatio ?? 0.05;
      const armoredMult = armoredMultiplier ?? 1;
      return {
        type: 'storage',
        title: 'Capacité de stockage',
        rows: levels.map((level, i) => ({
          level,
          capacity: storageCapacity(level, prodConfig?.storage),
          gain: i === 0 ? null : storageCapacity(level, prodConfig?.storage) - storageCapacity(level - 1, prodConfig?.storage),
          armored: Math.floor(storageCapacity(level, prodConfig?.storage) * baseRatio * armoredMult),
        })),
      };
    }
    case 'missionCenter':
      return {
        type: 'missionCenter',
        title: 'Progression du Centre de missions',
        rows: levels.map((level) => ({
          level,
          cooldown: discoveryCooldown(level),
          depositSize: depositSize(level, 1.0),
        })),
      };
    case 'missionRelay': {
      const biome = (planetClassId ?? null) as MissionRelayBiome;
      const perLevel = getMissionRelayBonusPerLevel(biome);
      return {
        type: 'missionRelay',
        title: 'Bonus de récompenses PvE',
        biome,
        rows: levels.map((level) => ({
          level,
          minerai:   perLevel.minerai   * level,
          silicium:  perLevel.silicium  * level,
          hydrogene: perLevel.hydrogene * level,
          pirate:    perLevel.pirate    * level,
        })),
      };
    }
    case 'galacticMarket':
      return {
        type: 'market',
        title: 'Offres simultanées',
        rows: levels.map((level) => ({
          level,
          maxOffers: maxMarketOffers(level),
        })),
      };
    case 'planetaryShield':
      return {
        type: 'shield',
        title: 'Bouclier & Énergie',
        rows: levels.map((level) => ({
          level,
          shield: calculateShieldCapacity(level),
          energy: -calculateShieldEnergy(level),
        })),
      };
    default:
      return null;
  }
}

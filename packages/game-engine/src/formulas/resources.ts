import {
  mineraiProduction,
  siliciumProduction,
  hydrogeneProduction,
  solarPlantEnergy,
  solarSatelliteEnergy,
  mineraiMineEnergy,
  siliciumMineEnergy,
  hydrogeneSynthEnergy,
  storageCapacity,
  calculateProductionFactor,
} from './production.js';
import { calculateShieldEnergy } from './shield.js';

export interface ProductionConfig {
  minerai: { baseProduction: number; exponentBase: number };
  silicium: { baseProduction: number; exponentBase: number };
  hydrogene: { baseProduction: number; exponentBase: number; tempCoeffA: number; tempCoeffB: number };
  solar: { baseProduction: number; exponentBase: number };
  mineraiEnergy: { baseConsumption: number; exponentBase: number };
  siliciumEnergy: { baseConsumption: number; exponentBase: number };
  hydrogeneEnergy: { baseConsumption: number; exponentBase: number };
  storage: { storageBase: number; coeffA: number; coeffB: number; coeffC: number };
  satellite: { homePlanetEnergy: number; baseDivisor: number; baseOffset: number };
}

export const DEFAULT_PRODUCTION_CONFIG: ProductionConfig = {
  minerai: { baseProduction: 30, exponentBase: 1.1 },
  silicium: { baseProduction: 20, exponentBase: 1.1 },
  hydrogene: { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 1.36, tempCoeffB: 0.004 },
  solar: { baseProduction: 20, exponentBase: 1.1 },
  mineraiEnergy: { baseConsumption: 10, exponentBase: 1.1 },
  siliciumEnergy: { baseConsumption: 10, exponentBase: 1.1 },
  hydrogeneEnergy: { baseConsumption: 20, exponentBase: 1.1 },
  storage: { storageBase: 5000, coeffA: 2.5, coeffB: 20, coeffC: 33 },
  satellite: { homePlanetEnergy: 50, baseDivisor: 4, baseOffset: 20 },
};

export interface PlanetTypeBonus {
  mineraiBonus?: number;
  siliciumBonus?: number;
  hydrogeneBonus?: number;
}

export interface PlanetLevels {
  mineraiMineLevel: number;
  siliciumMineLevel: number;
  hydrogeneSynthLevel: number;
  solarPlantLevel: number;
  storageMineraiLevel: number;
  storageSiliciumLevel: number;
  storageHydrogeneLevel: number;
  maxTemp: number;
  solarSatelliteCount: number;
  isHomePlanet?: boolean;
  mineraiMinePercent?: number;
  siliciumMinePercent?: number;
  hydrogeneSynthPercent?: number;
  planetaryShieldLevel?: number;
  shieldPercent?: number;
}

export interface ProductionRates {
  mineraiPerHour: number;
  siliciumPerHour: number;
  hydrogenePerHour: number;
  productionFactor: number;
  energyProduced: number;
  energyConsumed: number;
  mineraiMineEnergyConsumption: number;
  siliciumMineEnergyConsumption: number;
  hydrogeneSynthEnergyConsumption: number;
  shieldEnergyConsumption: number;
  shieldPercent: number;
  mineraiMinePercent: number;
  siliciumMinePercent: number;
  hydrogeneSynthPercent: number;
  storageMineraiCapacity: number;
  storageSiliciumCapacity: number;
  storageHydrogeneCapacity: number;
}

export function calculateProductionRates(
  planet: PlanetLevels,
  bonus?: PlanetTypeBonus,
  prodConfig: ProductionConfig = DEFAULT_PRODUCTION_CONFIG,
  talentBonuses?: Record<string, number>,
): ProductionRates {
  const mineraiPct = (planet.mineraiMinePercent ?? 100) / 100;
  const siliciumPct = (planet.siliciumMinePercent ?? 100) / 100;
  const hydrogenePct = (planet.hydrogeneSynthPercent ?? 100) / 100;

  const mBonus = bonus?.mineraiBonus ?? 1;
  const sBonus = bonus?.siliciumBonus ?? 1;
  const hBonus = bonus?.hydrogeneBonus ?? 1;

  const tMinerai = 1 + (talentBonuses?.['production_minerai'] ?? 0);
  const tSilicium = 1 + (talentBonuses?.['production_silicium'] ?? 0);
  const tHydrogene = 1 + (talentBonuses?.['production_hydrogene'] ?? 0);

  const energyBonus = 1 + (talentBonuses?.['energy_production'] ?? 0);
  const solarSatEnergy = solarSatelliteEnergy(planet.maxTemp, planet.isHomePlanet, prodConfig.satellite) * planet.solarSatelliteCount;
  const energyProduced = Math.floor((solarPlantEnergy(planet.solarPlantLevel, prodConfig.solar) + solarSatEnergy) * energyBonus);

  const energyEfficiency = 1 + (talentBonuses?.['energy_consumption'] ?? 0);
  const mineraiEnergy = Math.floor(mineraiMineEnergy(planet.mineraiMineLevel, prodConfig.mineraiEnergy) * mineraiPct * energyEfficiency);
  const siliciumEnergy = Math.floor(siliciumMineEnergy(planet.siliciumMineLevel, prodConfig.siliciumEnergy) * siliciumPct * energyEfficiency);
  const hydrogeneEnergy = Math.floor(hydrogeneSynthEnergy(planet.hydrogeneSynthLevel, prodConfig.hydrogeneEnergy) * hydrogenePct * energyEfficiency);
  const shieldPct = (planet.shieldPercent ?? 100) / 100;
  const shieldEnergy = Math.floor(calculateShieldEnergy(planet.planetaryShieldLevel ?? 0) * shieldPct * energyEfficiency);
  const energyConsumed = mineraiEnergy + siliciumEnergy + hydrogeneEnergy + shieldEnergy;

  const factor = calculateProductionFactor(energyProduced, energyConsumed);

  return {
    mineraiPerHour: Math.floor(mineraiProduction(planet.mineraiMineLevel, mineraiPct * factor, prodConfig.minerai) * mBonus * tMinerai),
    siliciumPerHour: Math.floor(siliciumProduction(planet.siliciumMineLevel, siliciumPct * factor, prodConfig.silicium) * sBonus * tSilicium),
    hydrogenePerHour: Math.floor(hydrogeneProduction(planet.hydrogeneSynthLevel, planet.maxTemp, hydrogenePct * factor, prodConfig.hydrogene) * hBonus * tHydrogene),
    productionFactor: factor,
    energyProduced,
    energyConsumed,
    mineraiMineEnergyConsumption: mineraiEnergy,
    siliciumMineEnergyConsumption: siliciumEnergy,
    hydrogeneSynthEnergyConsumption: hydrogeneEnergy,
    shieldEnergyConsumption: shieldEnergy,
    shieldPercent: planet.shieldPercent ?? 100,
    mineraiMinePercent: planet.mineraiMinePercent ?? 100,
    siliciumMinePercent: planet.siliciumMinePercent ?? 100,
    hydrogeneSynthPercent: planet.hydrogeneSynthPercent ?? 100,
    storageMineraiCapacity: Math.floor(storageCapacity(planet.storageMineraiLevel, prodConfig.storage) * (1 + (talentBonuses?.['storage_minerai'] ?? 0))),
    storageSiliciumCapacity: Math.floor(storageCapacity(planet.storageSiliciumLevel, prodConfig.storage) * (1 + (talentBonuses?.['storage_silicium'] ?? 0))),
    storageHydrogeneCapacity: Math.floor(storageCapacity(planet.storageHydrogeneLevel, prodConfig.storage) * (1 + (talentBonuses?.['storage_hydrogene'] ?? 0))),
  };
}

export interface PlanetResources extends PlanetLevels {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

/**
 * Calculate current resources with lazy production since last update.
 * Production is capped at storage capacity, but resources already above
 * capacity (e.g. received via transport) are preserved — production simply
 * stops until the player spends down below the cap.
 */
export function calculateResources(
  planet: PlanetResources,
  resourcesUpdatedAt: Date,
  now: Date,
  bonus?: PlanetTypeBonus,
  prodConfig?: ProductionConfig,
  talentBonuses?: Record<string, number>,
): { minerai: number; silicium: number; hydrogene: number } {
  const rates = calculateProductionRates(planet, bonus, prodConfig, talentBonuses);
  const elapsedHours = Math.max(0, (now.getTime() - resourcesUpdatedAt.getTime()) / (3600 * 1000));

  const minerai = planet.minerai >= rates.storageMineraiCapacity
    ? planet.minerai
    : Math.min(
        planet.minerai + Math.floor(rates.mineraiPerHour * elapsedHours),
        rates.storageMineraiCapacity,
      );
  const silicium = planet.silicium >= rates.storageSiliciumCapacity
    ? planet.silicium
    : Math.min(
        planet.silicium + Math.floor(rates.siliciumPerHour * elapsedHours),
        rates.storageSiliciumCapacity,
      );
  const hydrogene = planet.hydrogene >= rates.storageHydrogeneCapacity
    ? planet.hydrogene
    : Math.min(
        planet.hydrogene + Math.floor(rates.hydrogenePerHour * elapsedHours),
        rates.storageHydrogeneCapacity,
      );

  return { minerai, silicium, hydrogene };
}

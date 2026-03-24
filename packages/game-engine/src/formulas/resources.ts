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
  mineraiMinePercent: number;
  siliciumMinePercent: number;
  hydrogeneSynthPercent: number;
  storageMineraiCapacity: number;
  storageSiliciumCapacity: number;
  storageHydrogeneCapacity: number;
}

export function calculateProductionRates(planet: PlanetLevels, bonus?: PlanetTypeBonus, prodConfig: ProductionConfig = DEFAULT_PRODUCTION_CONFIG): ProductionRates {
  const mineraiPct = (planet.mineraiMinePercent ?? 100) / 100;
  const siliciumPct = (planet.siliciumMinePercent ?? 100) / 100;
  const hydrogenePct = (planet.hydrogeneSynthPercent ?? 100) / 100;

  const mBonus = bonus?.mineraiBonus ?? 1;
  const sBonus = bonus?.siliciumBonus ?? 1;
  const hBonus = bonus?.hydrogeneBonus ?? 1;

  const solarSatEnergy = solarSatelliteEnergy(planet.maxTemp, planet.isHomePlanet, prodConfig.satellite) * planet.solarSatelliteCount;
  const energyProduced = solarPlantEnergy(planet.solarPlantLevel, prodConfig.solar) + solarSatEnergy;

  const mineraiEnergy = Math.floor(mineraiMineEnergy(planet.mineraiMineLevel, prodConfig.mineraiEnergy) * mineraiPct);
  const siliciumEnergy = Math.floor(siliciumMineEnergy(planet.siliciumMineLevel, prodConfig.siliciumEnergy) * siliciumPct);
  const hydrogeneEnergy = Math.floor(hydrogeneSynthEnergy(planet.hydrogeneSynthLevel, prodConfig.hydrogeneEnergy) * hydrogenePct);
  const energyConsumed = mineraiEnergy + siliciumEnergy + hydrogeneEnergy;

  const factor = calculateProductionFactor(energyProduced, energyConsumed);

  return {
    mineraiPerHour: Math.floor(mineraiProduction(planet.mineraiMineLevel, mineraiPct * factor, prodConfig.minerai) * mBonus),
    siliciumPerHour: Math.floor(siliciumProduction(planet.siliciumMineLevel, siliciumPct * factor, prodConfig.silicium) * sBonus),
    hydrogenePerHour: Math.floor(hydrogeneProduction(planet.hydrogeneSynthLevel, planet.maxTemp, hydrogenePct * factor, prodConfig.hydrogene) * hBonus),
    productionFactor: factor,
    energyProduced,
    energyConsumed,
    mineraiMineEnergyConsumption: mineraiEnergy,
    siliciumMineEnergyConsumption: siliciumEnergy,
    hydrogeneSynthEnergyConsumption: hydrogeneEnergy,
    mineraiMinePercent: planet.mineraiMinePercent ?? 100,
    siliciumMinePercent: planet.siliciumMinePercent ?? 100,
    hydrogeneSynthPercent: planet.hydrogeneSynthPercent ?? 100,
    storageMineraiCapacity: storageCapacity(planet.storageMineraiLevel, prodConfig.storage),
    storageSiliciumCapacity: storageCapacity(planet.storageSiliciumLevel, prodConfig.storage),
    storageHydrogeneCapacity: storageCapacity(planet.storageHydrogeneLevel, prodConfig.storage),
  };
}

export interface PlanetResources extends PlanetLevels {
  minerai: number;
  silicium: number;
  hydrogene: number;
}

/**
 * Calculate current resources with lazy production since last update.
 * Caps resources at storage capacity.
 */
export function calculateResources(
  planet: PlanetResources,
  resourcesUpdatedAt: Date,
  now: Date,
  bonus?: PlanetTypeBonus,
  prodConfig?: ProductionConfig,
): { minerai: number; silicium: number; hydrogene: number } {
  const rates = calculateProductionRates(planet, bonus, prodConfig);
  const elapsedHours = Math.max(0, (now.getTime() - resourcesUpdatedAt.getTime()) / (3600 * 1000));

  const minerai = Math.min(
    planet.minerai + Math.floor(rates.mineraiPerHour * elapsedHours),
    rates.storageMineraiCapacity,
  );
  const silicium = Math.min(
    planet.silicium + Math.floor(rates.siliciumPerHour * elapsedHours),
    rates.storageSiliciumCapacity,
  );
  const hydrogene = Math.min(
    planet.hydrogene + Math.floor(rates.hydrogenePerHour * elapsedHours),
    rates.storageHydrogeneCapacity,
  );

  return { minerai, silicium, hydrogene };
}

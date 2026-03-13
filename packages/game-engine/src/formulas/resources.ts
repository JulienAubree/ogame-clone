import {
  metalProduction,
  crystalProduction,
  deuteriumProduction,
  solarPlantEnergy,
  metalMineEnergy,
  crystalMineEnergy,
  deutSynthEnergy,
  storageCapacity,
  calculateProductionFactor,
} from './production.js';

export interface PlanetLevels {
  metalMineLevel: number;
  crystalMineLevel: number;
  deutSynthLevel: number;
  solarPlantLevel: number;
  storageMetalLevel: number;
  storageCrystalLevel: number;
  storageDeutLevel: number;
  maxTemp: number;
}

export interface ProductionRates {
  metalPerHour: number;
  crystalPerHour: number;
  deutPerHour: number;
  productionFactor: number;
  energyProduced: number;
  energyConsumed: number;
  storageMetalCapacity: number;
  storageCrystalCapacity: number;
  storageDeutCapacity: number;
}

export function calculateProductionRates(planet: PlanetLevels): ProductionRates {
  const energyProduced = solarPlantEnergy(planet.solarPlantLevel);
  const energyConsumed =
    metalMineEnergy(planet.metalMineLevel) +
    crystalMineEnergy(planet.crystalMineLevel) +
    deutSynthEnergy(planet.deutSynthLevel);

  const factor = calculateProductionFactor(energyProduced, energyConsumed);

  return {
    metalPerHour: metalProduction(planet.metalMineLevel, factor),
    crystalPerHour: crystalProduction(planet.crystalMineLevel, factor),
    deutPerHour: deuteriumProduction(planet.deutSynthLevel, planet.maxTemp, factor),
    productionFactor: factor,
    energyProduced,
    energyConsumed,
    storageMetalCapacity: storageCapacity(planet.storageMetalLevel),
    storageCrystalCapacity: storageCapacity(planet.storageCrystalLevel),
    storageDeutCapacity: storageCapacity(planet.storageDeutLevel),
  };
}

export interface PlanetResources extends PlanetLevels {
  metal: number;
  crystal: number;
  deuterium: number;
}

/**
 * Calculate current resources with lazy production since last update.
 * Caps resources at storage capacity.
 */
export function calculateResources(
  planet: PlanetResources,
  resourcesUpdatedAt: Date,
  now: Date,
): { metal: number; crystal: number; deuterium: number } {
  const rates = calculateProductionRates(planet);
  const elapsedHours = Math.max(0, (now.getTime() - resourcesUpdatedAt.getTime()) / (3600 * 1000));

  const metal = Math.min(
    planet.metal + Math.floor(rates.metalPerHour * elapsedHours),
    rates.storageMetalCapacity,
  );
  const crystal = Math.min(
    planet.crystal + Math.floor(rates.crystalPerHour * elapsedHours),
    rates.storageCrystalCapacity,
  );
  const deuterium = Math.min(
    planet.deuterium + Math.floor(rates.deutPerHour * elapsedHours),
    rates.storageDeutCapacity,
  );

  return { metal, crystal, deuterium };
}

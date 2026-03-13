/**
 * Metal mine production per hour.
 * Formula: 30 * level * 1.1^level * productionFactor
 */
export function metalProduction(level: number, productionFactor: number = 1): number {
  return Math.floor(30 * level * Math.pow(1.1, level) * productionFactor);
}

/**
 * Crystal mine production per hour.
 * Formula: 20 * level * 1.1^level * productionFactor
 */
export function crystalProduction(level: number, productionFactor: number = 1): number {
  return Math.floor(20 * level * Math.pow(1.1, level) * productionFactor);
}

/**
 * Deuterium synthesizer production per hour.
 * Formula: 10 * level * 1.1^level * (1.36 - 0.004 * maxTemp) * productionFactor
 */
export function deuteriumProduction(level: number, maxTemp: number, productionFactor: number = 1): number {
  return Math.floor(10 * level * Math.pow(1.1, level) * (1.36 - 0.004 * maxTemp) * productionFactor);
}

/**
 * Solar plant energy production.
 * Formula: 20 * level * 1.1^level
 */
export function solarPlantEnergy(level: number): number {
  return Math.floor(20 * level * Math.pow(1.1, level));
}

/**
 * Metal mine energy consumption.
 * Formula: 10 * level * 1.1^level
 */
export function metalMineEnergy(level: number): number {
  return Math.floor(10 * level * Math.pow(1.1, level));
}

/**
 * Crystal mine energy consumption.
 * Formula: 10 * level * 1.1^level
 */
export function crystalMineEnergy(level: number): number {
  return Math.floor(10 * level * Math.pow(1.1, level));
}

/**
 * Deuterium synthesizer energy consumption.
 * Formula: 20 * level * 1.1^level
 */
export function deutSynthEnergy(level: number): number {
  return Math.floor(20 * level * Math.pow(1.1, level));
}

/**
 * Storage capacity for metal, crystal, or deuterium.
 * Formula: 5000 * floor(2.5 * e^(20 * level / 33))
 */
export function storageCapacity(level: number): number {
  return 5000 * Math.floor(2.5 * Math.exp((20 * level) / 33));
}

/**
 * Calculate the production factor based on energy balance.
 * If energy produced >= energy consumed, factor is 1.
 * Otherwise, factor is produced / consumed.
 * If consumed is 0, factor is 1.
 */
export function calculateProductionFactor(energyProduced: number, energyConsumed: number): number {
  if (energyConsumed === 0) return 1;
  if (energyProduced >= energyConsumed) return 1;
  return energyProduced / energyConsumed;
}

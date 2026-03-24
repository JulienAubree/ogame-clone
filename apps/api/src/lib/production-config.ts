import type { ProductionConfig } from '@ogame-clone/game-engine';

export function buildProductionConfig(config: { production: Record<string, any>; universe: Record<string, unknown> }): ProductionConfig {
  const mc = config.production['mineraiMine'];
  const sc = config.production['siliciumMine'];
  const hc = config.production['hydrogeneSynth'];
  const sp = config.production['solarPlant'];
  return {
    minerai: { baseProduction: mc?.baseProduction ?? 30, exponentBase: mc?.exponentBase ?? 1.1 },
    silicium: { baseProduction: sc?.baseProduction ?? 20, exponentBase: sc?.exponentBase ?? 1.1 },
    hydrogene: {
      baseProduction: hc?.baseProduction ?? 10, exponentBase: hc?.exponentBase ?? 1.1,
      tempCoeffA: hc?.tempCoeffA ?? 1.36, tempCoeffB: hc?.tempCoeffB ?? 0.004,
    },
    solar: { baseProduction: sp?.baseProduction ?? 20, exponentBase: sp?.exponentBase ?? 1.1 },
    mineraiEnergy: { baseConsumption: mc?.energyConsumption ?? 10, exponentBase: mc?.exponentBase ?? 1.1 },
    siliciumEnergy: { baseConsumption: sc?.energyConsumption ?? 10, exponentBase: sc?.exponentBase ?? 1.1 },
    hydrogeneEnergy: { baseConsumption: hc?.energyConsumption ?? 20, exponentBase: hc?.exponentBase ?? 1.1 },
    storage: {
      storageBase: Number(config.universe.storage_base) || 5000,
      coeffA: Number(config.universe.storage_coeff_a) || 2.5,
      coeffB: Number(config.universe.storage_coeff_b) || 20,
      coeffC: Number(config.universe.storage_coeff_c) || 33,
    },
    satellite: {
      homePlanetEnergy: Number(config.universe.satellite_home_planet_energy) || 50,
      baseDivisor: Number(config.universe.satellite_base_divisor) || 4,
      baseOffset: Number(config.universe.satellite_base_offset) || 20,
    },
  };
}

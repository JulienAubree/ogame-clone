import { describe, it, expect } from 'vitest';
import { calculateResources, calculateProductionRates } from './resources.js';
import type { ProductionConfig } from './resources.js';

describe('calculateProductionRates', () => {
  it('returns hourly rates for level 1 mines, solar 1, no energy deficit', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 1,
      siliciumMineLevel: 1,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    expect(rates.mineraiPerHour).toBe(33);
    expect(rates.siliciumPerHour).toBe(22);
    expect(rates.hydrogenePerHour).toBe(0);
    expect(rates.productionFactor).toBe(1);
  });

  it('returns reduced production when energy deficit', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 5,
      siliciumMineLevel: 5,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    expect(rates.productionFactor).toBeCloseTo(0.1375, 4);
    expect(rates.energyProduced).toBe(22);
    expect(rates.energyConsumed).toBe(160);
  });

  it('includes solar satellite energy in production', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 5,
      siliciumMineLevel: 5,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 10,
    });
    // Solar plant L1 = 22, 10 satellites * 40 each = 400, total = 422
    expect(rates.energyProduced).toBe(422);
    expect(rates.productionFactor).toBe(1);
  });

  it('home planet satellites always produce 50 energy each', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 5,
      siliciumMineLevel: 5,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: -200,
      solarSatelliteCount: 10,
      isHomePlanet: true,
    });
    // Solar plant L1 = 22, 10 satellites * 50 each = 500, total = 522
    expect(rates.energyProduced).toBe(522);
  });

  it('works with zero satellites (backward compat)', () => {
    const rates = calculateProductionRates({
      mineraiMineLevel: 1,
      siliciumMineLevel: 1,
      hydrogeneSynthLevel: 0,
      solarPlantLevel: 1,
      storageMineraiLevel: 0,
      storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0,
      maxTemp: 80,
      solarSatelliteCount: 0,
    });
    expect(rates.energyProduced).toBe(22);
  });
});

describe('calculateResources', () => {
  const basePlanet = {
    minerai: 500,
    silicium: 500,
    hydrogene: 0,
    mineraiMineLevel: 1,
    siliciumMineLevel: 1,
    hydrogeneSynthLevel: 0,
    solarPlantLevel: 1,
    storageMineraiLevel: 0,
    storageSiliciumLevel: 0,
    storageHydrogeneLevel: 0,
    maxTemp: 80,
    solarSatelliteCount: 0,
  };

  it('adds production over 1 hour', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const result = calculateResources(basePlanet, oneHourAgo, new Date());
    expect(result.minerai).toBe(533);
    expect(result.silicium).toBe(522);
    expect(result.hydrogene).toBe(0);
  });

  it('caps at storage capacity', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const result = calculateResources(basePlanet, tenDaysAgo, new Date());
    expect(result.minerai).toBeLessThanOrEqual(10000);
    expect(result.silicium).toBeLessThanOrEqual(10000);
  });

  it('does not go below current resources', () => {
    const now = new Date();
    const result = calculateResources(basePlanet, now, now);
    expect(result.minerai).toBe(500);
    expect(result.silicium).toBe(500);
  });
});

describe('calculateProductionRates with custom config', () => {
  it('uses custom production config', () => {
    const customConfig: ProductionConfig = {
      minerai: { baseProduction: 60, exponentBase: 1.1 },
      silicium: { baseProduction: 20, exponentBase: 1.1 },
      hydrogene: { baseProduction: 10, exponentBase: 1.1, tempCoeffA: 1.36, tempCoeffB: 0.004 },
      solar: { baseProduction: 20, exponentBase: 1.1 },
      mineraiEnergy: { baseConsumption: 10, exponentBase: 1.1 },
      siliciumEnergy: { baseConsumption: 10, exponentBase: 1.1 },
      hydrogeneEnergy: { baseConsumption: 20, exponentBase: 1.1 },
      storage: { storageBase: 5000, coeffA: 2.5, coeffB: 20, coeffC: 33 },
      satellite: { homePlanetEnergy: 50, baseDivisor: 4, baseOffset: 20 },
    };
    const planet = {
      mineraiMineLevel: 1, siliciumMineLevel: 0, hydrogeneSynthLevel: 0,
      solarPlantLevel: 5, storageMineraiLevel: 0, storageSiliciumLevel: 0,
      storageHydrogeneLevel: 0, maxTemp: 50, solarSatelliteCount: 0,
    };
    const rates = calculateProductionRates(planet, undefined, customConfig);
    // With baseProduction=60: 60 * 1 * 1.1 = 66 (vs default 33)
    expect(rates.mineraiPerHour).toBe(66);
  });
});

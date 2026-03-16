import { describe, it, expect } from 'vitest';
import { calculateResources, calculateProductionRates } from './resources.js';

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
    });
    expect(rates.productionFactor).toBeCloseTo(0.1375, 4);
    expect(rates.energyProduced).toBe(22);
    expect(rates.energyConsumed).toBe(160);
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

import { describe, it, expect } from 'vitest';
import { calculateResources, calculateProductionRates } from './resources.js';

describe('calculateProductionRates', () => {
  it('returns hourly rates for level 1 mines, solar 1, no energy deficit', () => {
    const rates = calculateProductionRates({
      metalMineLevel: 1,
      crystalMineLevel: 1,
      deutSynthLevel: 0,
      solarPlantLevel: 1,
      storageMetalLevel: 0,
      storageCrystalLevel: 0,
      storageDeutLevel: 0,
      maxTemp: 80,
    });
    expect(rates.metalPerHour).toBe(33);
    expect(rates.crystalPerHour).toBe(22);
    expect(rates.deutPerHour).toBe(0);
    expect(rates.productionFactor).toBe(1);
  });

  it('returns reduced production when energy deficit', () => {
    const rates = calculateProductionRates({
      metalMineLevel: 5,
      crystalMineLevel: 5,
      deutSynthLevel: 0,
      solarPlantLevel: 1,
      storageMetalLevel: 0,
      storageCrystalLevel: 0,
      storageDeutLevel: 0,
      maxTemp: 80,
    });
    expect(rates.productionFactor).toBeCloseTo(0.1375, 4);
    expect(rates.energyProduced).toBe(22);
    expect(rates.energyConsumed).toBe(160);
  });
});

describe('calculateResources', () => {
  const basePlanet = {
    metal: 500,
    crystal: 500,
    deuterium: 0,
    metalMineLevel: 1,
    crystalMineLevel: 1,
    deutSynthLevel: 0,
    solarPlantLevel: 1,
    storageMetalLevel: 0,
    storageCrystalLevel: 0,
    storageDeutLevel: 0,
    maxTemp: 80,
  };

  it('adds production over 1 hour', () => {
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const result = calculateResources(basePlanet, oneHourAgo, new Date());
    expect(result.metal).toBe(533);
    expect(result.crystal).toBe(522);
    expect(result.deuterium).toBe(0);
  });

  it('caps at storage capacity', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const result = calculateResources(basePlanet, tenDaysAgo, new Date());
    expect(result.metal).toBeLessThanOrEqual(10000);
    expect(result.crystal).toBeLessThanOrEqual(10000);
  });

  it('does not go below current resources', () => {
    const now = new Date();
    const result = calculateResources(basePlanet, now, now);
    expect(result.metal).toBe(500);
    expect(result.crystal).toBe(500);
  });
});

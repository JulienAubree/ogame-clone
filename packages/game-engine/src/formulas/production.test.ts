import { describe, it, expect } from 'vitest';
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

describe('Metal production', () => {
  it('level 0 produces 0', () => {
    expect(metalProduction(0)).toBe(0);
  });
  it('level 1 produces 33', () => {
    // 30 * 1 * 1.1 = 33
    expect(metalProduction(1)).toBe(33);
  });
  it('level 5 produces 241', () => {
    // 30 * 5 * 1.1^5 = 150 * 1.61051 = 241.576 -> 241
    expect(metalProduction(5)).toBe(241);
  });
  it('level 10 produces 778', () => {
    // 30 * 10 * 1.1^10 = 300 * 2.59374 = 778.122 -> 778
    expect(metalProduction(10)).toBe(778);
  });
  it('respects production factor', () => {
    // 30 * 10 * 2.59374 * 0.5 = 389.061 -> 389
    expect(metalProduction(10, 0.5)).toBe(389);
  });
});

describe('Crystal production', () => {
  it('level 1 produces 22', () => {
    // 20 * 1 * 1.1 = 22
    expect(crystalProduction(1)).toBe(22);
  });
  it('level 5 produces 161', () => {
    // 20 * 5 * 1.61051 = 161.051 -> 161
    expect(crystalProduction(5)).toBe(161);
  });
  it('level 10 produces 518', () => {
    // 20 * 10 * 2.59374 = 518.748 -> 518
    expect(crystalProduction(10)).toBe(518);
  });
});

describe('Deuterium production', () => {
  it('level 5, maxTemp 80 produces 83', () => {
    // 10 * 5 * 1.61051 * (1.36 - 0.32) = 80.5255 * 1.04 = 83.746 -> 83
    expect(deuteriumProduction(5, 80)).toBe(83);
  });
  it('level 10, maxTemp -40 produces 394', () => {
    // 10 * 10 * 2.59374 * (1.36 + 0.16) = 259.374 * 1.52 = 394.248 -> 394
    expect(deuteriumProduction(10, -40)).toBe(394);
  });
});

describe('Solar plant energy', () => {
  it('level 1 produces 22', () => {
    // 20 * 1 * 1.1 = 22
    expect(solarPlantEnergy(1)).toBe(22);
  });
  it('level 5 produces 161', () => {
    // 20 * 5 * 1.61051 = 161.051 -> 161
    expect(solarPlantEnergy(5)).toBe(161);
  });
});

describe('Energy consumption', () => {
  it('metal mine level 5 consumes 80', () => {
    // 10 * 5 * 1.61051 = 80.525 -> 80
    expect(metalMineEnergy(5)).toBe(80);
  });
  it('crystal mine level 5 consumes 80', () => {
    // 10 * 5 * 1.61051 = 80.525 -> 80
    expect(crystalMineEnergy(5)).toBe(80);
  });
  it('deut synth level 5 consumes 161', () => {
    // 20 * 5 * 1.61051 = 161.051 -> 161
    expect(deutSynthEnergy(5)).toBe(161);
  });
});

describe('Storage capacity', () => {
  it('level 0 has 10000 capacity', () => {
    // 5000 * floor(2.5 * e^0) = 5000 * floor(2.5) = 5000 * 2 = 10000
    expect(storageCapacity(0)).toBe(10000);
  });
  it('level 1 has 20000', () => {
    // 5000 * floor(2.5 * e^(20/33)) = 5000 * floor(2.5 * 1.8340) = 5000 * floor(4.585) = 5000 * 4 = 20000
    expect(storageCapacity(1)).toBe(20000);
  });
  it('level 5 has 255000', () => {
    // 5000 * floor(2.5 * e^(100/33)) = 5000 * floor(2.5 * 20.6968) = 5000 * floor(51.742) = 5000 * 51 = 255000
    expect(storageCapacity(5)).toBe(255000);
  });
});

describe('Production factor', () => {
  it('returns 1 when energy sufficient', () => {
    expect(calculateProductionFactor(100, 50)).toBe(1);
  });
  it('returns ratio when energy insufficient', () => {
    expect(calculateProductionFactor(50, 100)).toBe(0.5);
  });
  it('returns 1 when no consumption', () => {
    expect(calculateProductionFactor(0, 0)).toBe(1);
  });
});

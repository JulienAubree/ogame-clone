import { describe, it, expect } from 'vitest';
import {
  baseExtraction,
  totalExtracted,
  prospectionDuration,
  miningDuration,
  poolSize,
  accumulationCap,
  computeSlagRate,
  computeMiningExtraction,
} from './pve.js';

describe('baseExtraction', () => {
  it('returns 2000 at center level 1', () => {
    expect(baseExtraction(1)).toBe(2000);
  });
  it('returns 2800 at center level 2', () => {
    expect(baseExtraction(2)).toBe(2800);
  });
  it('returns 3600 at center level 3', () => {
    expect(baseExtraction(3)).toBe(3600);
  });
  it('returns 9200 at center level 10', () => {
    expect(baseExtraction(10)).toBe(9200);
  });
});

describe('totalExtracted', () => {
  it('caps at 10 prospectors', () => {
    expect(totalExtracted(1, 15, 100000, 500000)).toBe(2000 * 10);
  });
  it('caps at cargo capacity', () => {
    expect(totalExtracted(1, 3, 5000, 100000)).toBe(5000);
  });
  it('caps at deposit remaining', () => {
    expect(totalExtracted(1, 3, 100000, 1000)).toBe(1000);
  });
  it('normal case: 3 prospectors at level 1', () => {
    expect(totalExtracted(1, 3, 100000, 100000)).toBe(6000);
  });
});

describe('prospectionDuration', () => {
  it('returns 9 min for 20000 deposit', () => {
    expect(prospectionDuration(20000)).toBe(9);
  });
  it('returns 13 min for 40000 deposit', () => {
    expect(prospectionDuration(40000)).toBe(13);
  });
  it('returns 17 min for 60000 deposit', () => {
    expect(prospectionDuration(60000)).toBe(17);
  });
  it('returns 21 min for 80000 deposit', () => {
    expect(prospectionDuration(80000)).toBe(21);
  });
  it('returns 5 min for small deposit (< 10000)', () => {
    expect(prospectionDuration(5000)).toBe(5);
  });
});

describe('miningDuration', () => {
  it('returns 15 min at center 1, no bonus', () => {
    expect(miningDuration(1, 1)).toBe(15);
  });
  it('returns 10.5 min at center 1, 0.7 multiplier', () => {
    expect(miningDuration(1, 0.7)).toBeCloseTo(10.5);
  });
  it('returns 7.5 min at center 1, 0.5 multiplier', () => {
    expect(miningDuration(1, 0.5)).toBeCloseTo(7.5);
  });
  it('returns 3 min at center 1, 0.2 multiplier', () => {
    expect(miningDuration(1, 0.2)).toBeCloseTo(3);
  });
  it('returns 5 min at center 11, no bonus (floor)', () => {
    expect(miningDuration(11, 1)).toBe(5);
  });
  it('returns 0.5 min at center 11, 0.1 multiplier', () => {
    expect(miningDuration(11, 0.1)).toBeCloseTo(0.5);
  });
  it('clamps multiplier at 0.01', () => {
    expect(miningDuration(1, 0.01)).toBeCloseTo(0.15);
  });
});

describe('poolSize', () => {
  it('returns 3 at level 1-2', () => {
    expect(poolSize(1)).toBe(3);
    expect(poolSize(2)).toBe(3);
  });
  it('returns 4 at level 3-4', () => {
    expect(poolSize(3)).toBe(4);
    expect(poolSize(4)).toBe(4);
  });
  it('returns 5 at level 5-6', () => {
    expect(poolSize(5)).toBe(5);
    expect(poolSize(6)).toBe(5);
  });
  it('returns 6 (cap) at level 7+', () => {
    expect(poolSize(7)).toBe(6);
    expect(poolSize(10)).toBe(6);
  });
});

describe('accumulationCap', () => {
  it('is 2x pool size', () => {
    expect(accumulationCap(1)).toBe(6);
    expect(accumulationCap(3)).toBe(8);
    expect(accumulationCap(7)).toBe(12);
  });
});

describe('computeSlagRate', () => {
  it('returns baseSlagRate when refining level is 0', () => {
    expect(computeSlagRate(0.35, 0)).toBeCloseTo(0.35);
  });

  it('reduces multiplicatively at level 3', () => {
    expect(computeSlagRate(0.30, 3)).toBeCloseTo(0.30 * 0.85 ** 3);
  });

  it('reduces to ~2.5% at level 15 with 30% base', () => {
    expect(computeSlagRate(0.30, 15)).toBeCloseTo(0.30 * 0.85 ** 15);
  });

  it('clamps to 0.99 max if baseSlagRate is misconfigured', () => {
    expect(computeSlagRate(1.5, 0)).toBe(0.99);
  });

  it('clamps to 0 min', () => {
    expect(computeSlagRate(-0.1, 0)).toBe(0);
  });
});

describe('computeMiningExtraction', () => {
  it('reduces effective cargo and increases deposit loss', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      depositRemaining: 100000,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toBe(6000);
    expect(result.depositLoss).toBeCloseTo(8571.43, 0);
  });

  it('caps at effective cargo when extraction exceeds it', () => {
    const result = computeMiningExtraction({
      centerLevel: 10,
      nbProspectors: 10,
      cargoCapacity: 10000,
      depositRemaining: 500000,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toBe(7000);
    expect(result.depositLoss).toBeCloseTo(10000, 0);
  });

  it('handles deposit nearly depleted (less than depositLoss)', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      depositRemaining: 500,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toBe(350);
    expect(result.depositLoss).toBe(500);
  });

  it('returns full extraction when slagRate is 0', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      depositRemaining: 100000,
      slagRate: 0,
    });
    expect(result.playerReceives).toBe(6000);
    expect(result.depositLoss).toBe(6000);
  });

  it('handles very high slag rate (0.99)', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      depositRemaining: 100000,
      slagRate: 0.99,
    });
    expect(result.playerReceives).toBe(100);
    expect(result.depositLoss).toBe(10000);
  });
});

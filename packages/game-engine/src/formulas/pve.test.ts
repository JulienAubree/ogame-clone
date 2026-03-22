import { describe, it, expect } from 'vitest';
import {
  baseExtraction,
  prospectionDuration,
  miningDuration,
  discoveryCooldown,
  depositSize,
  depositComposition,
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
  // 5 prospectors, cargo 3750: 3750 / (5*2000) * 10 = 3.75 → clamped to 5
  it('clamps to 5 min when cargo/prosp ratio is low', () => {
    expect(miningDuration(3750, 5, 1)).toBe(5);
  });
  // 5 prospectors, cargo 20000: 20000 / (5*2000) * 10 = 20
  it('scales with cargo capacity', () => {
    expect(miningDuration(20000, 5, 1)).toBe(20);
  });
  // 10 prospectors, cargo 20000: 20000 / (10*2000) * 10 = 10
  it('more prospectors reduce duration', () => {
    expect(miningDuration(20000, 10, 1)).toBe(10);
  });
  // bonus multiplier applies (rock fracturing)
  it('applies bonus multiplier', () => {
    expect(miningDuration(20000, 5, 0.5)).toBeCloseTo(10);
  });
  // caps prospectors at 10
  it('caps effective prospectors at 10', () => {
    expect(miningDuration(20000, 15, 1)).toBe(miningDuration(20000, 10, 1));
  });
  // minimum 1 prospector
  it('treats 0 prospectors as 1', () => {
    expect(miningDuration(2000, 0, 1)).toBe(miningDuration(2000, 1, 1));
  });
});

describe('discoveryCooldown', () => {
  it('returns 6h at level 1', () => { expect(discoveryCooldown(1)).toBe(6); });
  it('returns 2h at level 5', () => { expect(discoveryCooldown(5)).toBe(2); });
  it('returns 1h at level 6', () => { expect(discoveryCooldown(6)).toBe(1); });
  it('floors at 1h for level 7+', () => { expect(discoveryCooldown(7)).toBe(1); expect(discoveryCooldown(15)).toBe(1); });
});

describe('depositSize', () => {
  it('returns base 15000 at level 1', () => { expect(depositSize(1, 1.0)).toBe(15000); });
  it('scales with level', () => { expect(depositSize(10, 1.0)).toBe(60000); });
  it('applies variance multiplier', () => { expect(depositSize(1, 0.6)).toBe(9000); expect(depositSize(1, 1.6)).toBe(24000); });
});

describe('depositComposition', () => {
  it('returns ratios that sum to 1', () => {
    const comp = depositComposition(0.6, 0.3);
    expect(comp.minerai + comp.silicium + comp.hydrogene).toBeCloseTo(1);
  });
  it('clamps hydrogene to minimum 0.02', () => {
    const comp = depositComposition(0.15, 0.10);
    expect(comp.hydrogene).toBeGreaterThanOrEqual(0.02);
    expect(comp.minerai + comp.silicium + comp.hydrogene).toBeCloseTo(1);
  });
  it('uses base ratios with zero offsets', () => {
    const comp = depositComposition(0, 0);
    expect(comp.minerai).toBeCloseTo(0.6, 1);
    expect(comp.silicium).toBeCloseTo(0.3, 1);
    expect(comp.hydrogene).toBeCloseTo(0.1, 1);
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
  it('distributes proportionally to remaining quantities', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 30000,
      hydrogeneRemaining: 20000,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toEqual({ minerai: 3000, silicium: 1800, hydrogene: 1200 });
    expect(result.depositLoss.minerai).toBeCloseTo(4285, 0);
    expect(result.depositLoss.silicium).toBeCloseTo(2571, 0);
    expect(result.depositLoss.hydrogene).toBeCloseTo(1714, 0);
  });

  it('handles deposit nearly depleted (all drained)', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 200,
      siliciumRemaining: 200,
      hydrogeneRemaining: 100,
      slagRate: 0.30,
    });
    expect(result.depositLoss).toEqual({ minerai: 200, silicium: 200, hydrogene: 100 });
    expect(result.playerReceives).toEqual({
      minerai: Math.floor(200 * 0.7),
      silicium: Math.floor(200 * 0.7),
      hydrogene: Math.floor(100 * 0.7),
    });
  });

  it('returns full extraction when slagRate is 0', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 50000,
      hydrogeneRemaining: 0,
      slagRate: 0,
    });
    expect(result.playerReceives).toEqual({ minerai: 3000, silicium: 3000, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 3000, silicium: 3000, hydrogene: 0 });
  });

  it('handles only one resource remaining', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 80000,
      slagRate: 0.15,
    });
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 6000 });
    expect(result.depositLoss.hydrogene).toBeCloseTo(7058, 0);
  });

  it('returns all zeros when deposit is empty', () => {
    const result = computeMiningExtraction({
      centerLevel: 1,
      nbProspectors: 3,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 0,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });

  it('caps at effective cargo when extraction exceeds it', () => {
    const result = computeMiningExtraction({
      centerLevel: 10,
      nbProspectors: 10,
      cargoCapacity: 10000,
      mineraiRemaining: 200000,
      siliciumRemaining: 200000,
      hydrogeneRemaining: 100000,
      slagRate: 0.30,
    });
    expect(result.playerReceives.minerai).toBe(Math.floor(7000 * 0.4));
    expect(result.playerReceives.silicium).toBe(Math.floor(7000 * 0.4));
    expect(result.playerReceives.hydrogene).toBe(7000 - 2800 - 2800);
  });
});

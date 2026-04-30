import { describe, it, expect } from 'vitest';
import {
  prospectionDuration,
  miningDuration,
  discoveryCooldown,
  depositSize,
  depositComposition,
  computeSlagRate,
  computeMiningExtraction,
  explorationQuota,
  explorationRewards,
} from './pve.js';

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
  // fleetExtraction = sum of miningExtraction per ship (e.g. 5 prospectors × 3000 = 15000)
  // cargo 3750, extraction 15000: 3750 / 15000 * 10 = 2.5 → clamped to 5
  it('clamps to 5 min when cargo/extraction ratio is low', () => {
    expect(miningDuration(3750, 12500, 1)).toBe(5);
  });
  // cargo 25000, extraction 12500: 25000 / 12500 * 10 = 20
  it('scales with cargo capacity', () => {
    expect(miningDuration(25000, 12500, 1)).toBe(20);
  });
  // cargo 25000, extraction 25000: 25000 / 25000 * 10 = 10
  it('more extraction reduces duration', () => {
    expect(miningDuration(25000, 25000, 1)).toBe(10);
  });
  // bonus multiplier applies (rock fracturing)
  it('applies bonus multiplier', () => {
    expect(miningDuration(25000, 12500, 0.5)).toBeCloseTo(10);
  });
  // minimum extraction of 1
  it('treats 0 extraction as 1', () => {
    expect(miningDuration(2500, 0, 1)).toBe(miningDuration(2500, 1, 1));
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
  // fleetExtraction=7500 (e.g. 3 prospectors × 2500)
  // cargo 10000, slagRate 0.30: effectiveCargo=7000, maxExtractable=min(7500,7000)=7000
  // remaining 50k/30k/20k → ratios 0.5/0.3/0.2
  it('distributes proportionally to remaining quantities', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 7500,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 30000,
      hydrogeneRemaining: 20000,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toEqual({ minerai: 3500, silicium: 2100, hydrogene: 1400 });
    expect(result.depositLoss.minerai).toBe(5000);
    expect(result.depositLoss.silicium).toBe(3000);
    expect(result.depositLoss.hydrogene).toBe(2000);
  });

  it('handles deposit nearly depleted (all drained)', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 7500,
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

  // slagRate=0: effectiveCargo=10000, maxExtractable=min(7500,10000)=7500
  // remaining 50k/50k/0 → ratios 0.5/0.5
  it('returns full extraction when slagRate is 0', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 7500,
      cargoCapacity: 10000,
      mineraiRemaining: 50000,
      siliciumRemaining: 50000,
      hydrogeneRemaining: 0,
      slagRate: 0,
    });
    expect(result.playerReceives).toEqual({ minerai: 3750, silicium: 3750, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 3750, silicium: 3750, hydrogene: 0 });
  });

  // slagRate=0.15: effectiveCargo=8500, maxExtractable=min(7500,8500)=7500
  it('handles only one resource remaining', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 7500,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 80000,
      slagRate: 0.15,
    });
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 7500 });
    expect(result.depositLoss.hydrogene).toBeCloseTo(8823, 0);
  });

  it('returns all zeros when deposit is empty', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 7500,
      cargoCapacity: 10000,
      mineraiRemaining: 0,
      siliciumRemaining: 0,
      hydrogeneRemaining: 0,
      slagRate: 0.30,
    });
    expect(result.playerReceives).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    expect(result.depositLoss).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });

  // fleetExtraction=25000 (e.g. 10 prosp), cargo 10000, slagRate 0.30: effectiveCargo=7000
  // maxExtractable=min(25000,7000)=7000. ratios: 0.4/0.4/0.2
  it('caps at effective cargo when extraction exceeds it', () => {
    const result = computeMiningExtraction({
      fleetExtraction: 25000,
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

describe('Parametric config', () => {
  it('discoveryCooldown with custom base', () => {
    expect(discoveryCooldown(1, { base: 10, minimum: 2 })).toBe(9);
    expect(discoveryCooldown(9, { base: 10, minimum: 2 })).toBe(2);
  });

  it('depositSize with custom base and increment', () => {
    const size = depositSize(3, 1.0, { base: 20000, increment: 10000 });
    expect(size).toBe(40000);
  });
});

describe('explorationQuota', () => {
  it('retourne 0 si centerLevel <= 0', () => {
    expect(explorationQuota(0)).toBe(0);
    expect(explorationQuota(-3)).toBe(0);
  });
  it('floor à 2 sur low level', () => {
    expect(explorationQuota(1)).toBe(2);
    expect(explorationQuota(3)).toBe(2);
    expect(explorationQuota(5)).toBe(2);
  });
  it('monte à 3 vers level 7-9', () => {
    expect(explorationQuota(7)).toBe(3);
    expect(explorationQuota(9)).toBe(3);
  });
  it('cap à 5 sur high level', () => {
    expect(explorationQuota(13)).toBe(5);
    expect(explorationQuota(20)).toBe(5);
    expect(explorationQuota(100)).toBe(5);
  });
});

describe('explorationRewards', () => {
  it('linéaire en centerLevel × quota', () => {
    const r1 = explorationRewards(5, 2);
    expect(r1).toEqual({ minerai: 2000, silicium: 1500, hydrogene: 1000, exilium: 1 });
    const r2 = explorationRewards(10, 4);
    expect(r2).toEqual({ minerai: 8000, silicium: 6000, hydrogene: 4000, exilium: 1 });
  });
  it('exilium toujours 1, même si level/quota petits', () => {
    expect(explorationRewards(1, 2).exilium).toBe(1);
    expect(explorationRewards(0, 0).exilium).toBe(1);
  });
  it('clamp safe pour valeurs invalides', () => {
    const r = explorationRewards(0, 0);
    expect(r.minerai).toBeGreaterThan(0);
  });
});

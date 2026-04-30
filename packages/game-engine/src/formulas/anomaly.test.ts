import { describe, it, expect } from 'vitest';
import { anomalyEnemyFP, anomalyLoot, anomalyEnemyRecoveryCount } from './anomaly.js';

describe('anomalyEnemyFP', () => {
  it('depth 1 = 50% du FP joueur', () => {
    expect(anomalyEnemyFP(1000, 1)).toBe(500);
  });
  it('depth 2 avec growth 1.3 = 65% du FP joueur', () => {
    expect(anomalyEnemyFP(1000, 2)).toBeCloseTo(650);
  });
  it('depth 4 avec growth 1.3 ≈ 109.85%', () => {
    expect(anomalyEnemyFP(1000, 4)).toBeCloseTo(1098.5, 1);
  });
  it('growth custom', () => {
    expect(anomalyEnemyFP(1000, 3, 1.5)).toBeCloseTo(1125);
  });
  it('FP <= 0 → 0', () => {
    expect(anomalyEnemyFP(0, 1)).toBe(0);
    expect(anomalyEnemyFP(-100, 1)).toBe(0);
  });
  it('depth <= 0 → 0', () => {
    expect(anomalyEnemyFP(1000, 0)).toBe(0);
  });
});

describe('anomalyLoot', () => {
  it('depth 1 = base répartie 40/35/25', () => {
    const r = anomalyLoot(1, 5000);
    expect(r.minerai).toBe(2000);
    expect(r.silicium).toBe(1750);
    expect(r.hydrogene).toBe(1250);
  });
  it('depth 4 ≈ 2.744× du loot de base', () => {
    const r = anomalyLoot(4, 5000);
    const total = 5000 * Math.pow(1.4, 3);
    expect(r.minerai).toBe(Math.floor(total * 0.40));
    expect(r.silicium).toBe(Math.floor(total * 0.35));
    expect(r.hydrogene).toBe(Math.floor(total * 0.25));
  });
  it('depth 0 → loot vide', () => {
    expect(anomalyLoot(0)).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });
  it('growth custom', () => {
    const r = anomalyLoot(2, 1000, 2);
    expect(r.minerai).toBe(800); // floor(2000 × 0.4)
  });
});

describe('anomalyEnemyRecoveryCount', () => {
  it('15% par défaut, floor', () => {
    const r = anomalyEnemyRecoveryCount({ lightfighter: 100, cruiser: 20 });
    expect(r).toEqual({ lightfighter: 15, cruiser: 3 });
  });
  it('ratio custom', () => {
    expect(anomalyEnemyRecoveryCount({ ship: 10 }, 0.5)).toEqual({ ship: 5 });
  });
  it('ships count < 1/ratio sont absents (pas de loot 0)', () => {
    expect(anomalyEnemyRecoveryCount({ rare: 3 })).toEqual({});
  });
  it('input vide → output vide', () => {
    expect(anomalyEnemyRecoveryCount({})).toEqual({});
  });
});

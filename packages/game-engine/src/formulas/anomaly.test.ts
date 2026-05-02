import { describe, it, expect } from 'vitest';
import { anomalyEnemyFP, anomalyLoot, anomalyEnemyRecoveryCount } from './anomaly.js';

describe('anomalyEnemyFP', () => {
  it('depth 1 par défaut = 70% du FP joueur (baseRatio 0.7)', () => {
    expect(anomalyEnemyFP(1000, 1)).toBeCloseTo(700);
  });
  it('depth 2 par défaut = 0.7 × 1.15 = 80.5%', () => {
    expect(anomalyEnemyFP(1000, 2)).toBeCloseTo(805);
  });
  it('depth 5 par défaut = 0.7 × 1.15^4 ≈ 122.4%', () => {
    expect(anomalyEnemyFP(1000, 5)).toBeCloseTo(1224, 0);
  });
  it('cap maxRatio à 1.3 dès que la formule dépasse', () => {
    // depth 7 : 0.7 × 1.15^6 ≈ 1.62 → capped 1.3
    expect(anomalyEnemyFP(1000, 7)).toBeCloseTo(1300);
    // depth 20 : énorme → toujours capped 1.3
    expect(anomalyEnemyFP(1000, 20)).toBeCloseTo(1300);
  });
  it('paramètres custom (override partiel)', () => {
    // baseRatio override seul
    expect(anomalyEnemyFP(1000, 1, { baseRatio: 0.5 })).toBeCloseTo(500);
    // growth override
    expect(anomalyEnemyFP(1000, 3, { growth: 1.3 })).toBeCloseTo(1183, 0);
    // cap relâché → permet ratio bien au-dessus de 1.3 (sinon plafonné à 1300)
    expect(anomalyEnemyFP(1000, 10, { maxRatio: 5 })).toBeGreaterThan(2000);
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
  it('8% par défaut, floor', () => {
    const r = anomalyEnemyRecoveryCount({ interceptor: 100, cruiser: 50 }, 5);
    // 100 × 0.08 = 8 (cap depth=5 → 5), 50 × 0.08 = 4 (sous cap)
    expect(r).toEqual({ interceptor: 5, cruiser: 4 });
  });
  it('cap = depth pour chaque type de vaisseau', () => {
    // Au depth 3, max 3 ships par type récupérés même si 8% en demanderait plus
    const r = anomalyEnemyRecoveryCount({ interceptor: 200 }, 3);
    expect(r).toEqual({ interceptor: 3 });
  });
  it('cap minimum de 1 (depth 0 ou négatif → cap à 1)', () => {
    const r = anomalyEnemyRecoveryCount({ interceptor: 100 }, 0);
    expect(r).toEqual({ interceptor: 1 });
  });
  it('ratio custom', () => {
    // Note: signature change → depth en 2e position, ratio en 3e
    expect(anomalyEnemyRecoveryCount({ ship: 10 }, 5, 0.5)).toEqual({ ship: 5 });
  });
  it('ships count < 1/ratio sont absents (pas de loot 0)', () => {
    // 8 × 0.08 = 0.64 → floor 0 → absent
    expect(anomalyEnemyRecoveryCount({ rare: 8 }, 5)).toEqual({});
  });
  it('input vide → output vide', () => {
    expect(anomalyEnemyRecoveryCount({}, 5)).toEqual({});
  });
  it('count <= 0 ignoré', () => {
    expect(anomalyEnemyRecoveryCount({ a: 0, b: -5, c: 100 }, 10)).toEqual({ c: 8 });
  });
});

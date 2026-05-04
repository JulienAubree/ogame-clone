import { describe, it, expect } from 'vitest';
import { anomalyEnemyFP, anomalyLoot, anomalyEnemyRecoveryCount, tierMultiplier } from './anomaly.js';

describe('anomalyEnemyFP', () => {
  it('depth 1 par défaut = 50% du FP joueur (baseRatio 0.5)', () => {
    expect(anomalyEnemyFP(1000, 1)).toBeCloseTo(500);
  });
  it('depth 2 par défaut = 0.5 × 1.15 = 57.5%', () => {
    expect(anomalyEnemyFP(1000, 2)).toBeCloseTo(575);
  });
  it('depth 5 par défaut = 0.5 × 1.15^4 ≈ 87.4%', () => {
    expect(anomalyEnemyFP(1000, 5)).toBeCloseTo(874.5, 0);
  });
  it('cap maxRatio à 1.3 dès que la formule dépasse', () => {
    // depth 8 : 0.5 × 1.15^7 ≈ 1.33 → capped 1.3
    expect(anomalyEnemyFP(1000, 8)).toBeCloseTo(1300);
    // depth 20 : énorme → toujours capped 1.3
    expect(anomalyEnemyFP(1000, 20)).toBeCloseTo(1300);
  });
  it('paramètres custom (override partiel)', () => {
    // baseRatio override seul
    expect(anomalyEnemyFP(1000, 1, { baseRatio: 0.7 })).toBeCloseTo(700);
    // growth override
    expect(anomalyEnemyFP(1000, 3, { growth: 1.3 })).toBeCloseTo(845, 0);
    // cap relâché → permet ratio bien au-dessus de 1.3 (sinon plafonné à 1300)
    expect(anomalyEnemyFP(1000, 10, { maxRatio: 5 })).toBeGreaterThan(1500);
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
  const fpConfig = { shotcountExponent: 1.5, divisor: 100 };

  // Reference stats matching the prod ship roster (with V2 FP traits).
  const stats = {
    interceptor: {
      weapons: 4, shotCount: 3, shield: 6, hull: 12,
      weaponProfiles: [{ damage: 4, shots: 3, targetCategory: 'light', hasChainKill: true }],
    },
    frigate: {
      weapons: 12, shotCount: 2, shield: 16, hull: 30,
      weaponProfiles: [
        { damage: 12, shots: 1, targetCategory: 'medium' },
        { damage: 6, shots: 2, targetCategory: 'light' },
      ],
    },
    cruiser: {
      weapons: 45, shotCount: 1, shield: 32, hull: 55,
      weaponProfiles: [
        { damage: 35, shots: 1, targetCategory: 'heavy' },
        { damage: 6, shots: 2, targetCategory: 'light',
          rafale: { category: 'light', count: 6 } },
      ],
    },
    battlecruiser: {
      weapons: 70, shotCount: 1, shield: 40, hull: 120,
      weaponProfiles: [
        { damage: 50, shots: 1, targetCategory: 'heavy' },
        { damage: 10, shots: 2, targetCategory: 'medium',
          rafale: { category: 'medium', count: 4 } },
      ],
    },
  };

  it('ratio croît avec le FP du vaisseau (light cheap, heavy précieux)', () => {
    const r = anomalyEnemyRecoveryCount(
      { interceptor: 100, frigate: 100, cruiser: 100, battlecruiser: 100 },
      stats,
      fpConfig,
    );
    // base 0.05 + FP × 0.001 :
    //   interceptor (FP ~2)   → 0.052 → 5
    //   frigate     (FP 11)   → 0.061 → 6
    //   cruiser     (FP 57)   → 0.107 → 10
    //   battlecruiser (FP 144) → 0.194 → 19
    expect(r.interceptor).toBeGreaterThanOrEqual(4);
    expect(r.interceptor).toBeLessThanOrEqual(7);
    expect(r.frigate).toBeGreaterThanOrEqual(5);
    expect(r.cruiser).toBeGreaterThanOrEqual(9);
    expect(r.battlecruiser).toBeGreaterThanOrEqual(15);
    // Order check : heavier = higher recovered count
    expect(r.battlecruiser).toBeGreaterThan(r.cruiser);
    expect(r.cruiser).toBeGreaterThan(r.frigate);
    expect(r.frigate).toBeGreaterThan(r.interceptor);
  });

  it('big haul scenario : 500 BCs killed → ~95 recovered', () => {
    const r = anomalyEnemyRecoveryCount({ battlecruiser: 500 }, stats, fpConfig);
    // BC ratio ~0.194 → floor(500 × 0.194) = 97
    expect(r.battlecruiser).toBeGreaterThan(80);
    expect(r.battlecruiser).toBeLessThanOrEqual(100);
  });

  it('cap maxRatio à 25% par défaut', () => {
    // FP very high stat → ratio would be > 25%, capped
    const overpoweredStats = {
      titan: { weapons: 0, shotCount: 1, shield: 1000, hull: 1000,
        weaponProfiles: [
          { damage: 100, shots: 1, targetCategory: 'heavy' },
          { damage: 100, shots: 1, targetCategory: 'medium' },
        ],
      },
    };
    const r = anomalyEnemyRecoveryCount({ titan: 100 }, overpoweredStats, fpConfig);
    // 100 × 0.25 = 25 (capped)
    expect(r.titan).toBe(25);
  });

  it('options custom (override partiel)', () => {
    const r = anomalyEnemyRecoveryCount(
      { cruiser: 100 }, stats, fpConfig,
      { baseRatio: 0.20 },  // base 20% au lieu de 5%
    );
    // 0.20 + 57×0.001 = 0.257 → cap 25% → 25
    expect(r.cruiser).toBe(25);
  });

  it('count <= 0 ignoré', () => {
    const r = anomalyEnemyRecoveryCount(
      { interceptor: 0, cruiser: -5, battlecruiser: 100 },
      stats, fpConfig,
    );
    expect(r.interceptor).toBeUndefined();
    expect(r.cruiser).toBeUndefined();
    expect(r.battlecruiser).toBeGreaterThan(0);
  });

  it('ship inconnu (pas dans stats) → ratio 0 → absent', () => {
    const r = anomalyEnemyRecoveryCount({ unknown: 100 }, stats, fpConfig);
    // unitFP = 0 → ratio = baseRatio (0.05) → 100 × 0.05 = 5
    // Actually baseRatio still applies even without stats
    expect(r.unknown).toBe(5);
  });

  it('input vide → output vide', () => {
    expect(anomalyEnemyRecoveryCount({}, stats, fpConfig)).toEqual({});
  });

  it('floor à 0 quand le résultat < 1 (pas de loot symbolique)', () => {
    // 5 cruisers × ~10.7% = 0.535 → floor 0 → absent
    const r = anomalyEnemyRecoveryCount({ cruiser: 5 }, stats, fpConfig);
    expect(r.cruiser).toBeUndefined();
  });
});

describe('tierMultiplier (V5-Tiers)', () => {
  it('returns 1.0 at tier 1 (default factor)', () => {
    expect(tierMultiplier(1)).toBe(1.0);
    expect(tierMultiplier(1, 1.0)).toBe(1.0);
    expect(tierMultiplier(1, 2.5)).toBe(1.0);
  });
  it('returns N at tier N with factor 1.0 (linear)', () => {
    expect(tierMultiplier(5, 1.0)).toBe(5.0);
    expect(tierMultiplier(10, 1.0)).toBe(10.0);
    expect(tierMultiplier(50, 1.0)).toBe(50.0);
  });
  it('respects custom factor', () => {
    expect(tierMultiplier(5, 2.0)).toBe(9.0);
    expect(tierMultiplier(10, 0.5)).toBe(5.5);
  });
});

describe('anomalyEnemyFP with tierMultiplier (V5-Tiers)', () => {
  it('returns same as V4 baseline when tierMultiplier=1.0', () => {
    const v4 = anomalyEnemyFP(1000, 5);
    const v5 = anomalyEnemyFP(1000, 5, { tierMultiplier: 1.0 });
    expect(v5).toBe(v4);
  });
  it('multiplies enemy FP by tierMultiplier post-cap', () => {
    // depth 5 : ratio = min(1.3, 0.5 × 1.15^4) = min(1.3, 0.874) = 0.874
    // playerFP 1000 × 0.874 × 3 (tier 3) = 2624
    const result = anomalyEnemyFP(1000, 5, { tierMultiplier: 3.0 });
    expect(result).toBeCloseTo(2624, 0);
  });
  it('high tier breaks past the maxRatio cap', () => {
    const result = anomalyEnemyFP(1000, 20, { tierMultiplier: 10.0 });
    expect(result).toBeCloseTo(13000, 0);
  });
});

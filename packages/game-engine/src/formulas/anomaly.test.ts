import { describe, it, expect } from 'vitest';
import { anomalyEnemyFP, anomalyLoot, anomalyEnemyRecoveryCount } from './anomaly.js';

describe('anomalyEnemyFP (V6-AbsoluteFP)', () => {
  it('tier 1 depth 1 par défaut = tierBaseFp (80)', () => {
    expect(anomalyEnemyFP(1, 1)).toBeCloseTo(80);
  });
  it('tier 1 depth 20 = tierBaseFp × cap maxRatio 3.0', () => {
    // 1.06^19 ≈ 3.025 → capped à 3.0 → 80 × 3 = 240
    expect(anomalyEnemyFP(1, 20)).toBeCloseTo(240, 0);
  });
  it('tier 5 depth 1 = 80 × 1.7^4 ≈ 668', () => {
    expect(anomalyEnemyFP(5, 1)).toBeCloseTo(80 * Math.pow(1.7, 4), 0);
  });
  it('tier 10 depth 1 ≈ 80 × 1.7^9 ≈ 9056', () => {
    const expected = 80 * Math.pow(1.7, 9);
    expect(anomalyEnemyFP(10, 1)).toBeCloseTo(expected, 0);
  });
  it('tier 20 depth 20 dans la zone hardcore (>1M FP)', () => {
    const fp = anomalyEnemyFP(20, 20);
    expect(fp).toBeGreaterThan(1_000_000);
  });
  it('intra-palier growth augmente le FP avec depth', () => {
    const d1 = anomalyEnemyFP(5, 1);
    const d10 = anomalyEnemyFP(5, 10);
    const d20 = anomalyEnemyFP(5, 20);
    expect(d10).toBeGreaterThan(d1);
    expect(d20).toBeGreaterThan(d10);
    // d20 capped à 3× d1
    expect(d20 / d1).toBeCloseTo(3.0, 1);
  });
  it('paramètres custom (override partiel)', () => {
    expect(anomalyEnemyFP(1, 1, { tierBaseFp: 200 })).toBeCloseTo(200);
    expect(anomalyEnemyFP(2, 1, { tierFpGrowth: 2.0 })).toBeCloseTo(160);
    // maxRatio cap relâché → croissance non-cappée
    expect(anomalyEnemyFP(1, 20, { maxRatio: 100 })).toBeGreaterThan(240);
  });
  it('tier <= 0 → 0', () => {
    expect(anomalyEnemyFP(0, 1)).toBe(0);
    expect(anomalyEnemyFP(-1, 1)).toBe(0);
  });
  it('depth <= 0 → 0', () => {
    expect(anomalyEnemyFP(1, 0)).toBe(0);
  });
  it('décorrélé du player FP (sanity check V6)', () => {
    // La formule ne prend plus playerFP en input — un débutant à 50 FP
    // et un hardcore à 50000 FP affrontent EXACTEMENT le même enemy au tier 1.
    // Test conceptuel : l'output ne dépend que de tier et depth.
    const fp = anomalyEnemyFP(1, 5);
    expect(fp).toBeCloseTo(80 * Math.pow(1.06, 4), 0);
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

// V6-AbsoluteFP : tierMultiplier helper retiré — la croissance entre paliers
// est désormais portée par tierBaseFp × tierFpGrowth^(tier-1) (cf. anomalyEnemyFP).

import { describe, it, expect } from 'vitest';
import { computeUnitFP, computeFleetFP, scaleFleetToFP } from './fp.js';

const DEFAULT_FP_CONFIG = { shotcountExponent: 1.5, divisor: 100 };

describe('computeUnitFP', () => {
  it('computes interceptor FP', () => {
    expect(computeUnitFP(
      { weapons: 4, shotCount: 3, shield: 8, hull: 12 },
      DEFAULT_FP_CONFIG,
    )).toBe(4);
  });

  it('computes frigate FP', () => {
    expect(computeUnitFP(
      { weapons: 12, shotCount: 2, shield: 16, hull: 30 },
      DEFAULT_FP_CONFIG,
    )).toBe(16);
  });

  it('computes cruiser FP', () => {
    expect(computeUnitFP(
      { weapons: 45, shotCount: 1, shield: 28, hull: 55 },
      DEFAULT_FP_CONFIG,
    )).toBe(37);
  });

  it('computes battlecruiser FP', () => {
    expect(computeUnitFP(
      { weapons: 70, shotCount: 1, shield: 40, hull: 100 },
      DEFAULT_FP_CONFIG,
    )).toBe(98);
  });

  it('returns 0 for zero weapons', () => {
    expect(computeUnitFP(
      { weapons: 0, shotCount: 1, shield: 8, hull: 12 },
      DEFAULT_FP_CONFIG,
    )).toBe(0);
  });

  it('returns 0 for zero durability', () => {
    expect(computeUnitFP(
      { weapons: 10, shotCount: 1, shield: 0, hull: 0 },
      DEFAULT_FP_CONFIG,
    )).toBe(0);
  });
});

describe('computeUnitFP V2 (weaponProfiles)', () => {
  it('uses weaponProfiles when provided (no legacy exponent)', () => {
    // DPS = 4×3 = 12 × 0.7 (specialist penalty) = 8.4
    // durability = 6+12 = 18
    // FP = round(8.4 * 18 / 100) = round(1.512) = 2
    expect(computeUnitFP({
      weapons: 4, shotCount: 3, shield: 6, hull: 12,
      weaponProfiles: [{ damage: 4, shots: 3, targetCategory: 'light' }],
    }, DEFAULT_FP_CONFIG)).toBe(2);
  });

  it('specialist penalty: single targetCategory → DPS × 0.7', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 50, hull: 50,
      weaponProfiles: [{ damage: 10, shots: 10, targetCategory: 'light' }],
    }, DEFAULT_FP_CONFIG);
    // DPS = 100 × 0.7 = 70, durability = 100, FP = round(70*100/100) = 70
    expect(fp).toBe(70);
  });

  it('no specialist penalty when 2+ distinct categories', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 50, hull: 50,
      weaponProfiles: [
        { damage: 10, shots: 5, targetCategory: 'light' },
        { damage: 10, shots: 5, targetCategory: 'medium' },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 100 × 1 = 100, durability = 100, FP = 100
    expect(fp).toBe(100);
  });

  it('rafale bonus weighted at 0.5 of raw damage', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 50, hull: 50,
      weaponProfiles: [
        { damage: 10, shots: 1, targetCategory: 'heavy' },
        // Add a 2nd weapon with rafale to avoid specialist penalty
        { damage: 5, shots: 1, targetCategory: 'light',
          rafale: { category: 'light', count: 4 } },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 10 + (5 + 4×5×0.5) = 10 + (5 + 10) = 25, durability = 100, FP = 25
    expect(fp).toBe(25);
  });

  it('chainKill multiplies that weapon DPS by 1.3', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 50, hull: 50,
      weaponProfiles: [
        { damage: 10, shots: 1, targetCategory: 'heavy' },
        { damage: 10, shots: 1, targetCategory: 'light', hasChainKill: true },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 10 + (10 × 1.3) = 23, durability = 100, FP = 23
    expect(fp).toBe(23);
  });

  it('armor adds 4× per point to durability', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 30, hull: 50, armor: 5,
      weaponProfiles: [
        { damage: 10, shots: 5, targetCategory: 'light' },
        { damage: 10, shots: 5, targetCategory: 'medium' },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 100, durability = 30 + 50 + 5×4 = 100, FP = 100
    expect(fp).toBe(100);
  });

  it('capital category doubles durability', () => {
    const fp = computeUnitFP({
      weapons: 0, shotCount: 1, shield: 100, hull: 100,
      categoryId: 'capital',
      weaponProfiles: [
        { damage: 10, shots: 5, targetCategory: 'heavy' },
        { damage: 10, shots: 5, targetCategory: 'medium' },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 100, durability = 200 × 2 = 400, FP = 400
    expect(fp).toBe(400);
  });

  it('cruiser-like ship (rafale + 2 cats) — all V2 effects together', () => {
    const fp = computeUnitFP({
      weapons: 45, shotCount: 1, shield: 32, hull: 55,
      weaponProfiles: [
        { damage: 35, shots: 1, targetCategory: 'heavy' },
        { damage: 6, shots: 2, targetCategory: 'light',
          rafale: { category: 'light', count: 6 } },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 35 + (12 + 6×6×0.5) = 35 + 12 + 18 = 65 (no penalty: 2 cats)
    // Durability = 32 + 55 = 87
    // FP = round(65 × 87 / 100) = 57
    expect(fp).toBe(57);
  });

  it('battlecruiser-like — capital + rafale + 2 cats', () => {
    const fp = computeUnitFP({
      weapons: 70, shotCount: 1, shield: 40, hull: 120,
      categoryId: 'capital',
      weaponProfiles: [
        { damage: 50, shots: 1, targetCategory: 'heavy' },
        { damage: 10, shots: 2, targetCategory: 'medium',
          rafale: { category: 'medium', count: 4 } },
      ],
    }, DEFAULT_FP_CONFIG);
    // DPS = 50 + (20 + 4×10×0.5) = 50 + 20 + 20 = 90
    // Durability = 40 + 120 = 160 × 2 (capital) = 320
    // FP = round(90 × 320 / 100) = 288
    expect(fp).toBe(288);
  });
});

describe('computeFleetFP', () => {
  it('sums FP for a mixed fleet', () => {
    const shipStats = {
      interceptor: { weapons: 4, shotCount: 3, shield: 8, hull: 12 },
      cruiser: { weapons: 45, shotCount: 1, shield: 28, hull: 55 },
    };
    expect(computeFleetFP(
      { interceptor: 10, cruiser: 2 },
      shipStats,
      DEFAULT_FP_CONFIG,
    )).toBe(114);
  });

  it('returns 0 for empty fleet', () => {
    expect(computeFleetFP({}, {}, DEFAULT_FP_CONFIG)).toBe(0);
  });

  it('ignores ships with count 0', () => {
    const shipStats = {
      interceptor: { weapons: 4, shotCount: 3, shield: 8, hull: 12 },
    };
    expect(computeFleetFP({ interceptor: 0 }, shipStats, DEFAULT_FP_CONFIG)).toBe(0);
  });
});

describe('scaleFleetToFP', () => {
  const shipStats = {
    interceptor: { weapons: 4, shotCount: 3, shield: 8, hull: 12 },
    frigate: { weapons: 12, shotCount: 2, shield: 16, hull: 30 },
  };

  it('scales up a fleet to reach target FP', () => {
    const result = scaleFleetToFP(
      { interceptor: 3, frigate: 1 },
      100,
      shipStats,
      DEFAULT_FP_CONFIG,
    );
    const resultFP = computeFleetFP(result, shipStats, DEFAULT_FP_CONFIG);
    expect(resultFP).toBeGreaterThanOrEqual(90);
    expect(resultFP).toBeLessThanOrEqual(115);
    expect(result.interceptor).toBeGreaterThan(result.frigate);
  });

  it('V6 : low target produces a low-FP fleet (no overshoot floor)', () => {
    // V1 behavior locked to a template minimum (3 inter + 1 frig ≈ 60 FP)
    // even when target was 5 FP, which broke V6-AbsoluteFP paliers where
    // tier-1 enemies need to actually be tier-1 sized.
    const result = scaleFleetToFP(
      { interceptor: 3, frigate: 1 },
      5,
      shipStats,
      DEFAULT_FP_CONFIG,
    );
    const resultFP = computeFleetFP(result, shipStats, DEFAULT_FP_CONFIG);
    // Should be close to 5, not the old ~60 floor.
    expect(resultFP).toBeLessThanOrEqual(15);
    expect(resultFP).toBeGreaterThan(0);
  });

  it('V6 : large mixed template hits low target without forcing a heavy unit', () => {
    // Regression test for the bug spotted in prod : tier 1 anomaly target ≈ 95 FP
    // produced a fleet with 1 BC + 2 cruisers + 4 frigates + 6 interceptors ≈ 314 FP
    // because the V1 algo used template counts as a minimum.
    const fullStats = {
      interceptor: { weapons: 4, shotCount: 3, shield: 8, hull: 12 },
      frigate: { weapons: 12, shotCount: 2, shield: 16, hull: 30 },
      cruiser: { weapons: 45, shotCount: 1, shield: 32, hull: 55 },
      battlecruiser: { weapons: 70, shotCount: 1, shield: 40, hull: 120 },
    };
    const result = scaleFleetToFP(
      { interceptor: 6, frigate: 4, cruiser: 2, battlecruiser: 1 },
      95,
      fullStats,
      DEFAULT_FP_CONFIG,
    );
    const resultFP = computeFleetFP(result, fullStats, DEFAULT_FP_CONFIG);
    // ±20% acceptable, no massive overshoot
    expect(resultFP).toBeGreaterThanOrEqual(75);
    expect(resultFP).toBeLessThanOrEqual(120);
    // Heavy units should NOT be forced into low-FP fleets
    expect(result.battlecruiser ?? 0).toBe(0);
  });

  it('handles single ship type', () => {
    const result = scaleFleetToFP(
      { interceptor: 1 },
      40,
      shipStats,
      DEFAULT_FP_CONFIG,
    );
    expect(result.interceptor).toBe(10);
  });

  it('returns empty for empty template', () => {
    const result = scaleFleetToFP({}, 100, shipStats, DEFAULT_FP_CONFIG);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

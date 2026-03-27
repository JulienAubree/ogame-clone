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

  it('does not scale below template base', () => {
    const result = scaleFleetToFP(
      { interceptor: 3, frigate: 1 },
      5,
      shipStats,
      DEFAULT_FP_CONFIG,
    );
    expect(result.interceptor).toBe(3);
    expect(result.frigate).toBe(1);
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

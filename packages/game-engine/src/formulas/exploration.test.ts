import { describe, it, expect } from 'vitest';
import { biomeDiscoveryProbability, scanDuration } from './exploration.js';

describe('biomeDiscoveryProbability', () => {
  it('returns ~22% for common with 1 ship, research 1', () => {
    const prob = biomeDiscoveryProbability(1, 1, 'common');
    expect(prob).toBeCloseTo(0.224, 2);
  });

  it('returns ~3% for legendary with 1 ship, research 1', () => {
    const prob = biomeDiscoveryProbability(1, 1, 'legendary');
    expect(prob).toBeCloseTo(0.028, 2);
  });

  it('scales with ship count', () => {
    const p1 = biomeDiscoveryProbability(1, 1, 'common');
    const p3 = biomeDiscoveryProbability(3, 1, 'common');
    const p5 = biomeDiscoveryProbability(5, 1, 'common');
    expect(p3).toBeGreaterThan(p1);
    expect(p5).toBeGreaterThan(p3);
  });

  it('scales with research level', () => {
    const r1 = biomeDiscoveryProbability(3, 1, 'rare');
    const r5 = biomeDiscoveryProbability(3, 5, 'rare');
    const r10 = biomeDiscoveryProbability(3, 10, 'rare');
    expect(r5).toBeGreaterThan(r1);
    expect(r10).toBeGreaterThan(r5);
  });

  it('caps at 95%', () => {
    const prob = biomeDiscoveryProbability(100, 100, 'common');
    expect(prob).toBe(0.95);
  });

  it('returns higher probability for common than legendary', () => {
    const common = biomeDiscoveryProbability(5, 5, 'common');
    const legendary = biomeDiscoveryProbability(5, 5, 'legendary');
    expect(common).toBeGreaterThan(legendary);
  });

  it('matches expected values from spec table', () => {
    expect(biomeDiscoveryProbability(5, 5, 'common')).toBeCloseTo(0.77, 1);
    expect(biomeDiscoveryProbability(5, 5, 'rare')).toBeCloseTo(0.26, 1);
    expect(biomeDiscoveryProbability(5, 5, 'epic')).toBeCloseTo(0.15, 1);
    expect(biomeDiscoveryProbability(5, 5, 'legendary')).toBeCloseTo(0.10, 1);
  });
});

describe('scanDuration', () => {
  it('returns 1800s at research 0', () => {
    expect(scanDuration(0)).toBe(1800);
  });

  it('decreases with research level', () => {
    expect(scanDuration(5)).toBeCloseTo(1200, -1);
    expect(scanDuration(10)).toBeCloseTo(900, -1);
  });

  it('never goes below a minimum', () => {
    expect(scanDuration(1000)).toBeGreaterThan(0);
  });
});
